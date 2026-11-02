//! Four bogie contact proxies, differential belts and grip-limited ground forces.
//! No direct yaw torque: track forces at contacts turn the hull, including slopes.
use crate::aven_tire::{ContactPatch, Impulse, SolveContext, v_add, v_scale};

pub fn belt_targets(throttle:f32, steer:f32, top_speed:f32) -> (f32,f32) {
    let base=throttle.clamp(-1.0,1.0)*if throttle<0.0 {top_speed.min(8.0)} else {top_speed};
    let turn=steer.clamp(-1.0,1.0)*3.0;
    (base-turn,base+turn)
}
pub fn solve(ctx:&SolveContext, throttle:f32, steer:f32, brake:f32, top_speed:f32, contacts:&[ContactPatch]) -> Vec<Impulse> {
    let (left,right)=belt_targets(throttle,steer,top_speed);
    let active=throttle.abs()>0.01 || steer.abs()>0.01;
    let n=4.0; // fixed load proxies; airborne tracks never receive redistributed thrust
    contacts.iter().filter(|p|p.grounded && p.normal_force>0.0).map(|p| {
        let target=if p.wheel.is_left(){left}else{right};
        let desired=if active {(target-p.v_long)*ctx.mass/n/0.6} else {0.0};
        let drive=desired.clamp(-ctx.engine_force/n,ctx.engine_force/n);
        let stopping=(-p.v_long*ctx.mass/n/ctx.dt).clamp(-ctx.brake_force*brake/n,ctx.brake_force*brake/n);
        let mut jx=(drive+stopping)*ctx.dt;
        let mut jy=-p.v_lat*ctx.mass/n*(1.0-(-6.0*ctx.dt).exp());
        let cap_x=(p.mu_long*p.normal_force*ctx.dt).max(0.001);
        // Belts scrub sideways to pivot; gripping like road tires prevents turns.
        let cap_y=(p.mu_lat*p.normal_force*ctx.dt*if steer.abs()>0.01 {0.12}else{0.65}).max(0.001);
        let demand=((jx/cap_x).powi(2)+(jy/cap_y).powi(2)).sqrt().max(1.0);
        jx/=demand;jy/=demand;
        Impulse{impulse:v_add(v_scale(p.forward,jx),v_scale(p.side,jy)),at_point:Some(p.apply_point)}
    }).collect()
}
#[cfg(test)] mod tests {
 use super::*;
 #[test] fn belts_drive_pivot_and_reverse(){assert_eq!(belt_targets(0.0,1.0,18.0),(-3.0,3.0));assert_eq!(belt_targets(1.0,0.0,18.0),(18.0,18.0));assert_eq!(belt_targets(-1.0,0.0,18.0),(-8.0,-8.0));}
}
