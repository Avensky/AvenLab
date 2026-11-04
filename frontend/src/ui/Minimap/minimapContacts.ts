import type {PhysicsEntitySnapshot,PhysicsSnapshot} from '../../store/session/networkStore';

/** Shared team radio spots contacts by proximity in the horizontal world plane.
 * This is minimap presentation, not line of sight or network entity culling. */
export const MINIMAP_DETECTION_RANGE_M=150;
export const MINIMAP_ALLY_COLOR='#58a9ff';
export const MINIMAP_ENEMY_COLOR='#ff6b52';
export type MinimapContact={id:string;x:number;z:number;side:'ally'|'enemy';defeated:boolean;carryingFlag?:'red'|'blue'};
const positionValid=(entity:PhysicsEntitySnapshot)=>entity.position?.length===3&&entity.position.every(Number.isFinite);
const teamValid=(team:unknown)=>team==='red'||team==='blue';
const living=(entity:PhysicsEntitySnapshot)=>entity.health?.defeated!==true&&(entity.health?.hp===undefined||(Number.isFinite(entity.health.hp)&&entity.health.hp>0));

/** Flag state only decorates an already visible contact. It must never create
 * a contact for an enemy outside the team's detection range. */
export function carriedFlag(snapshot:PhysicsSnapshot|null,playerId:string):'red'|'blue'|undefined {
 const flag=snapshot?.match_state?.flags?.find(flag=>flag.status==='carried'&&flag.carrier===playerId&&teamValid(flag.team));
 return flag?.team;
}
export function localCarriedFlag(snapshot:PhysicsSnapshot|null,playerId:string):'red'|'blue'|undefined {
 const me=snapshot?.entities.find(entity=>entity.id===playerId);
 return me&&positionValid(me)&&teamValid(me.team)&&living(me)?carriedFlag(snapshot,playerId):undefined;
}

export function minimapContacts(snapshot:PhysicsSnapshot|null,playerId:string,detectionRange=MINIMAP_DETECTION_RANGE_M):MinimapContact[]{
 const me=snapshot?.entities.find(entity=>entity.id===playerId);
 if(!me||!teamValid(me.team)||!Number.isSafeInteger(me.room_id)||me.room_id<0||!positionValid(me))return [];
 const entities=snapshot!.entities.filter(entity=>entity.room_id===me.room_id&&teamValid(entity.team)&&positionValid(entity));
 const detectors=entities.filter(entity=>entity.team===me.team&&living(entity));
 const rangeSquared=Number.isFinite(detectionRange)&&detectionRange>=0?detectionRange*detectionRange:-1;
 return entities.flatMap(entity=>{
  if(entity.id===playerId)return [];
  const ally=entity.team===me.team;
  if(!ally&&(!living(entity)||!detectors.some(detector=>(detector.position[0]-entity.position[0])**2+(detector.position[2]-entity.position[2])**2<=rangeSquared)))return [];
  const carryingFlag=living(entity)?carriedFlag(snapshot,entity.id):undefined;
  return [{id:entity.id,x:entity.position[0],z:entity.position[2],side:ally?'ally' as const:'enemy' as const,defeated:!living(entity),...(carryingFlag?{carryingFlag}:{})}];
 });
}

/** Keep team-radio contacts visible even outside the current map zoom. */
export function projectMinimapContact(contact:MinimapContact,centerX:number,centerZ:number,range:number,circular:boolean){
 if(![contact.x,contact.z,centerX,centerZ,range].every(Number.isFinite)||range<=0)return null;
 const dx=contact.x-centerX,dz=contact.z-centerZ,limit=range*.46;
 const distance=circular?Math.hypot(dx,dz):Math.max(Math.abs(dx),Math.abs(dz));
 const scale=distance>limit?limit/distance:1;
 return {x:centerX+dx*scale,z:centerZ+dz*scale,edge:scale<1};
}
