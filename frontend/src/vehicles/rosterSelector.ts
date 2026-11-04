import type { PhysicsEntitySnapshot, PhysicsSnapshot, VehicleColliderShape } from "../store/session/networkStore";

export type RosterEntity = Pick<PhysicsEntitySnapshot, "id" | "vehicle_id" | "team" | "collider">;
function sameShape(a?:VehicleColliderShape,b?:VehicleColliderShape) {
  return a===b || Boolean(a && b && a.nominal_wheel_center_y===b.nominal_wheel_center_y && a.wheel_count===b.wheel_count && a.wheel_radius===b.wheel_radius &&
    a.chassis_offset.every((n,i)=>n===b.chassis_offset[i]) &&
    a.chassis_half_extents.every((n,i)=>n===b.chassis_half_extents[i]));
}

/** Metadata is stable while poses, telemetry and combat stats stream in. */
export function createRosterSelector() {
  let rows:RosterEntity[]=[];
  return ({snapshot}:{snapshot:PhysicsSnapshot|null})=>{
    const entities=snapshot?.entities;
    if(!entities?.length){if(rows.length)rows=[];return rows;}
    if(entities.length===rows.length && entities.every((entity,i)=>{
      const row=rows[i];
      return entity.id===row.id && entity.vehicle_id===row.vehicle_id && entity.team===row.team && sameShape(entity.collider,row.collider);
    }))return rows;
    rows=entities.map(({id,vehicle_id,team,collider})=>({id,vehicle_id,team,collider}));
    return rows;
  };
}
