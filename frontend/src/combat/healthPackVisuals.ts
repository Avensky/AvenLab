import type {HealthPackSnapshot,PhysicsEntitySnapshot} from '../store/session/networkStore';

const point=(value:unknown):value is [number,number,number]=>Array.isArray(value)&&value.length===3&&value.every(Number.isFinite);
/** Reject absent/older contracts and malformed effects; neither an input press
 * nor the cosmetic flight itself is evidence that HP was restored. */
export function visibleHealthPack(entity:PhysicsEntitySnapshot,room:number):HealthPackSnapshot|null{
 const pack=entity.support?.pack;
 if(entity.room_id!==room||!pack||!Number.isSafeInteger(pack.seq)||pack.seq<=0||!['flying','hit','missed'].includes(pack.state)||!point(pack.position)||!point(pack.origin)||!point(pack.target_position)||!Number.isFinite(pack.remaining_s)||!Number.isFinite(pack.duration_s)||pack.duration_s<=0||!Number.isFinite(pack.healed_hp)||pack.healed_hp<0)return null;
 return pack;
}
