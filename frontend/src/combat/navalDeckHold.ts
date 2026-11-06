import type {PhysicsSnapshot,PhysicsEntitySnapshot} from '../store/session/networkStore';

/** Read-only mirror of the server's naval deck contact volume. This displays
 * the buff; the authoritative slowing force is applied in naval.rs. */
export function onNavalDeck(me:PhysicsEntitySnapshot|undefined|null,snapshot:PhysicsSnapshot|null|undefined):boolean{
  const ships:Record<string,[number,number,number]>={'hawaii-rescue':[12,5,77],louisiana:[18.335,5.5,94.04]};
  if(!me||!me.vehicle_id||me.vehicle_id in ships||me.health?.defeated)return false;
  for(const ship of snapshot?.entities??[]){
    const dims=ship.vehicle_id?ships[ship.vehicle_id]:undefined;
    if(!dims||ship.id===me.id)continue;
    const [x,y,z]=ship.position,[qx,qy,qz,qw]=ship.rotation;
    const yaw=Math.atan2(2*(qw*qy+qx*qz),1-2*(qy*qy+qz*qz));
    const dx=me.position[0]-x,dz=me.position[2]-z;
    const localX=Math.cos(yaw)*dx-Math.sin(yaw)*dz;
    const localZ=Math.sin(yaw)*dx+Math.cos(yaw)*dz;
    const localY=me.position[1]-y;
    if(Math.abs(localX)<dims[0]-2 && Math.abs(localZ)<dims[2]-5 &&
       localY>=dims[1]-.7 && localY<=dims[1]+3.3)return true;
  }
  return false;
}
