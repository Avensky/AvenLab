//! Arcade cannon trajectory: gravity-only, fixed muzzle speed, swept segments.
//! Collision is resolved along the arc at firing time (no flight-delay simulation).
use rapier3d::prelude::*;
pub const SPEED:f32=180.0;
pub const GRAVITY:f32=9.81;
pub const MAX_TIME:f32=8.0;
pub const SEGMENT_DT:f32=1.0/60.0;
pub fn position(origin:Point<Real>,direction:Vector<Real>,time:f32)->Point<Real>{
    origin+direction*(SPEED*time)-Vector::y()*(0.5*GRAVITY*time*time)
}
pub fn trace(origin:Point<Real>,direction:Vector<Real>,body:RigidBodyHandle,bodies:&RigidBodySet,colliders:&ColliderSet,queries:&QueryPipeline)->Option<(ColliderHandle,Point<Real>,f32,Vector<Real>)>{
    let mut previous=origin;
    for step in 1..=(MAX_TIME/SEGMENT_DT) as u32 {
        let time=step as f32*SEGMENT_DT;
        let next=position(origin,direction,time);let delta=next-previous;let length=delta.norm();
        if let Some((handle,intersection))=queries.cast_ray_and_get_normal(bodies,colliders,&Ray::new(previous,delta/length),length,true,QueryFilter::default().groups(crate::physics::vehicle_collision_groups(false)).exclude_rigid_body(body)){
            let toi=intersection.time_of_impact;
            return Some((handle,previous+delta*(toi/length),time-SEGMENT_DT+SEGMENT_DT*toi/length,intersection.normal));
        }
        previous=next;
    }
    None
}
#[cfg(test)]mod tests{
 use super::*;
 #[test]fn range_and_drop_match_the_displayed_gravity_equation(){let p=position(Point::origin(),Vector::z(),2.0);assert!((p.z-360.0).abs()<0.001);assert!((p.y+19.62).abs()<0.001);}
}
