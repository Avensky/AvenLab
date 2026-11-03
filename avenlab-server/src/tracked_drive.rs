//! Four bogie contact proxies, differential belts and grip-limited ground forces.
//! Track forces combine with bounded, ground-only arcade yaw assist in vehicle_forces.
use crate::aven_tire::{ContactPatch, Impulse, SolveContext, v_add, v_scale};

pub fn belt_targets(throttle:f32, steer:f32, top_speed:f32) -> (f32,f32) {
    // Trade forward speed for a tighter arc; reverse keeps hull-relative steering.
    let steer=steer.clamp(-1.0,1.0);
    let base=throttle.clamp(-1.0,1.0)*if throttle<0.0 {top_speed.min(8.0)} else {top_speed}*(1.0-0.90*steer.abs().powi(2));
    let turn=steer*7.5;
    (base-turn,base+turn)
}
pub fn solve(ctx:&SolveContext, throttle:f32, steer:f32, brake:f32, top_speed:f32, contacts:&[ContactPatch]) -> Vec<Impulse> {
    let (left,right)=belt_targets(throttle,steer,top_speed);
    let active=throttle.abs()>0.01 || steer.abs()>0.01;
    let n=4.0; // fixed load proxies; airborne tracks never receive redistributed thrust
    let mean = |left:bool| {
        let mut sum=0.0;let mut count=0.0;
        for p in contacts.iter().filter(|p|p.grounded && p.normal_force>0.0 && p.wheel.is_left()==left) {sum+=p.v_long;count+=1.0;}
        if count>0.0 {sum/count} else {0.0}
    };
    let (vl,vr)=(mean(true),mean(false));
    // Reserve engine effort for differential steering even during acceleration.
    // A hard rolling turn also needs forward braking, not only yaw effort.
    let force=ctx.engine_force/n*(1.0+0.6*steer.abs());
    let differential_budget=force*if throttle.abs()>0.01 {0.60}else{1.0};
    let differential=(((right-left)-(vr-vl))*ctx.mass/n/0.18*0.5).clamp(-differential_budget,differential_budget);
    let common=(((right+left)-(vr+vl))*ctx.mass/n/0.6*0.5).clamp(-(force-differential.abs()),force-differential.abs());
    contacts.iter().filter(|p|p.grounded && p.normal_force>0.0).map(|p| {
        let drive=(if active {common+if p.wheel.is_left(){-differential}else{differential}}else{0.0})*(1.0-brake.clamp(0.0,1.0));
        let stopping=(-p.v_long*ctx.mass/n/ctx.dt).clamp(-ctx.brake_force*brake/n,ctx.brake_force*brake/n);
        let mut jx=(drive+stopping)*ctx.dt;
        let mut jy=-p.v_lat*ctx.mass/n*(1.0-(-6.0*ctx.dt).exp());
        let cap_x=(p.mu_long*p.normal_force*ctx.dt).max(0.001);
        // Scrub at rest, regain lateral grip while rolling. A fixed scrub limit
        // makes the hull rotate while its velocity continues straight ahead.
        let rolling=((vl.abs()+vr.abs())*0.5/6.0).clamp(0.0,1.0);
        let lateral_grip=if steer.abs()>0.01 {0.045+0.805*rolling}else{0.85};
        let cap_y=(p.mu_lat*p.normal_force*ctx.dt*lateral_grip).max(0.001);
        jy=jy.clamp(-cap_y,cap_y);
        let demand=((jx/cap_x).powi(2)+(jy/cap_y).powi(2)).sqrt().max(1.0);
        jx/=demand;jy/=demand;
        Impulse{impulse:v_add(v_scale(p.forward,jx),v_scale(p.side,jy)),at_point:Some(p.apply_point)}
    }).collect()
}
#[cfg(test)] mod tests {
 use super::*;
 #[test] fn belts_drive_pivot_and_reverse(){assert_eq!(belt_targets(0.0,1.0,18.0),(-7.5,7.5));assert_eq!(belt_targets(1.0,0.0,18.0),(18.0,18.0));assert_eq!(belt_targets(-1.0,0.0,18.0),(-8.0,-8.0));}
}
