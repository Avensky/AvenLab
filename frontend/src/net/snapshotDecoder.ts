import {decodeCompactSnapshot} from './compactSnapshot.ts';

type Wire = Record<string, any>;
const word = (v:unknown):v is number => Number.isInteger(v) && (v as number)>=0 && (v as number)<=0xffffffff;

const DRIVER_KEYS=['last_input_seq','cockpit_mask','cabin_mask','parking_brake','cruise_target_kph','fuel','temp','engine_torque'] as const;

function apply(base:any, patch:any, depth=0):any {
  if (depth>32) throw new Error('Nested snapshot patch');
  if (patch===null) return base;
  if (!Array.isArray(patch)) throw new Error('Invalid snapshot patch');
  if (patch[0]===0 && patch.length===2) return patch[1];
  if (patch[0]===1 && Array.isArray(base) && base.length<=64 && word(patch[1]) && word(patch[2])) {
    const length=base.length;
    if (length<32 ? (patch[1]>>>length)!==0 || patch[2]!==0 : length<64 && (patch[2]>>>(length-32))!==0)
      throw new Error('Field mask exceeds tuple');
    const result=base.slice();let cursor=3;
    for (let index=0;index<length;index++) {
      const changed=((index<32?patch[1]:patch[2]) >>> (index%32))&1;
      if (!changed) continue;
      if (cursor>=patch.length) throw new Error('Invalid field mask');
      result[index]=apply(base[index],patch[cursor++],depth+1);
    }
    if (cursor!==patch.length) throw new Error('Extra patch values');
    return result;
  }
  if (patch[0]===2 && patch.length===2 && base && typeof base==='object' && !Array.isArray(base) &&
      patch[1] && typeof patch[1]==='object' && !Array.isArray(patch[1])) {
    const result={...base};
    for (const key of Object.keys(patch[1])) {
      if (!Object.hasOwn(base,key)) throw new Error('Unknown object field');
      Object.defineProperty(result,key,{value:apply(base[key],patch[1][key],depth+1),enumerable:true,configurable:true,writable:true});
    }
    return result;
  }
  throw new Error('Invalid snapshot patch');
}

/** One decoder per socket. Deltas always rebuild from the immutable keyframe,
 * never the last displayed frame: skipping an update cannot retain old damage,
 * control flags, roster entries or effects that have returned to their base state.
 */
export class SnapshotDecoder {
  private base:Wire|null=null;
  private owner:{world:number, values:any[]}|null=null;
  receiveDriver(wire:Wire):boolean {
    const v=wire.data;
    if(wire.type!=='driver'||!Number.isSafeInteger(wire.world_id)||!Array.isArray(v)||v.length!==8 ||
      !(v[0]===null||word(v[0])) || !word(v[1]) || !word(v[2]) || !Number.isFinite(v[3]) ||
      !(v[4]===null||Number.isFinite(v[4])) || !v.slice(5).every(Number.isFinite))return false;
    this.owner={world:wire.world_id,values:v};
    return true;
  }
  private project(decoded:Wire,playerId?:string):Wire {
    for(const entity of decoded.data.entities) {
      if(entity.cockpit_mask!==null)continue; // unscoped full fixture/older format
      if(entity.id===playerId && this.owner?.world===decoded.world_id) {
        for(let i=0;i<DRIVER_KEYS.length;i++)entity[DRIVER_KEYS[i]]=this.owner!.values[i];
      } else {for(const key of DRIVER_KEYS)delete entity[key];}
    }
    return decoded;
  }
  private requested=false;
  private missing=false;
  reset(){this.owner=null;this.base=null;this.requested=false;this.missing=false;}
  takeResyncRequest(){if(!this.missing||this.requested)return false;this.requested=true;return true;}
  decode(wire:Wire,playerId?:string):Wire|null {
    try {
      if(wire.type==='snapshot_compact') {
        const decoded=decodeCompactSnapshot(wire);
        if(!decoded)throw new Error('Invalid keyframe');
        this.base=Number.isSafeInteger(wire.base_id)&&wire.base_id>0?wire:null;
        this.requested=false;this.missing=false;
        return this.project(decoded,playerId);
      }
      if(wire.type!=='snapshot_delta'||![1,2].includes(wire.version)||!this.base||wire.version!==this.base.version||
          wire.world_id!==this.base.world_id||wire.base_id!==this.base.base_id) throw new Error('Missing keyframe');
      const data=apply(this.base.data,wire.patch);
      const decoded=decodeCompactSnapshot({...this.base,data});
      if(!decoded)throw new Error('Invalid reconstructed snapshot');
      return this.project(decoded,playerId);
    } catch {this.missing=true;return null;}
  }
}
