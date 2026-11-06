import type {PhysicsSnapshot,PhysicsEntitySnapshot} from '../store/session/networkStore';

/** Read-only mirror of the server's naval deck contact volume. This displays
 * the buff; the authoritative slowing force is applied in naval.rs. */
export function onNavalDeck(me:PhysicsEntitySnapshot|undefined|null,snapshot:PhysicsSnapshot|null|undefined):boolean{
  if(!me||me.vehicle_id==='hawaii-rescue'||me.health?.defeated)return false;
  for(const ship of snapshot?.entities??[]){
    if(ship.vehicle_id!=='hawaii-rescue'||ship.id===me.id)continue;
    const [x,y,z]=ship.position,[qx,qy,qz,qw]=ship.rotation;
    const yaw=Math.atan2(2*(qw*qy+qx*qz),1-2*(qy*qy+qz*qz));
    const dx=me.position[0]-x,dz=me.position[2]-z;
    const localX=Math.cos(yaw)*dx-Math.sin(yaw)*dz;
    const localZ=Math.sin(yaw)*dx+Math.cos(yaw)*dz;
    const localY=me.position[1]-y;
    if(Math.abs(localX)<10 && Math.abs(localZ)<72 && localY>=4.3 && localY<=8.3)return true;
  }
  return false;
}
