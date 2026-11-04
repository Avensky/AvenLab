//! Grounded three-second charge, four-second reduced-speed tail and repair cost.
use std::collections::HashSet;
use rapier3d::prelude::RigidBodyHandle;
pub const CHARGE_DURATION:f32=3.0;
pub const LINGER_DURATION:f32=4.0;
pub const DURATION:f32=CHARGE_DURATION+LINGER_DURATION;
pub const COOLDOWN:f32=60.0;
pub const SPEED_MULTIPLIER:f32=2.0;
pub const FORCE_MULTIPLIER:f32=3.0;
pub const STUN_SECONDS:f32=1.0;
pub const FUEL_COST:f32=10.0;
pub const CONDITION_COST:f32=0.04;
pub const HEAT_DEBT:f32=2.0;
// Full seven-second use adds 4.2–5.6 C before its existing 2 C end cost.
// Applied only while running; thermal-recovery cooling always takes precedence.
pub const MIN_HEAT_RISE_C_S:f32=0.6;
pub const MAX_HEAT_RISE_C_S:f32=0.8;
#[derive(Default)]
pub struct RamState{
 pub blocked:&'static str,pub remaining:f32,pub cooldown:f32,pub requested:bool,
 pub stun_remaining:f32,pub cost_due:bool,
 held:bool,pub hits:HashSet<RigidBodyHandle>,
}
impl RamState{
 pub fn advance(&mut self,dt:f32,allowed:bool)->bool{
  let mut started=false;
  self.remaining=(self.remaining-dt).max(0.0);if self.remaining<0.0001{self.remaining=0.0;}self.cooldown=(self.cooldown-dt).max(0.0);
  if !allowed&&self.blocked!="AIRBORNE"{self.remaining=0.0;}
  if self.requested&&!self.held&&self.cooldown<=0.0&&allowed{
   self.remaining=DURATION;self.cooldown=COOLDOWN;self.hits.clear();self.cost_due=true;started=true;
  }
  self.held=self.requested;started
 }
 pub fn cancel(&mut self){self.remaining=0.0;self.requested=false;}
 pub fn active(&self)->bool{self.remaining>0.0}
 pub fn charging(&self)->bool{self.remaining>LINGER_DURATION}
 pub fn charge_remaining(&self)->f32{(self.remaining-LINGER_DURATION).max(0.0)}
 pub fn speed_multiplier(&self)->f32{if self.charging(){SPEED_MULTIPLIER}else if self.active(){1.25}else{1.0}}
 pub fn force_multiplier(&self)->f32{if self.charging(){FORCE_MULTIPLIER}else if self.active(){1.35}else{1.0}}
}
#[cfg(test)]mod tests{
 use super::*;
 #[test]fn phases_and_cooldown_are_independent_and_holding_never_repeats(){
  let mut r=RamState::default();r.requested=true;assert!(r.advance(1.0/60.0,true));assert_eq!(r.remaining,7.0);assert_eq!(r.cooldown,60.0);
  r.requested=false;for _ in 0..181{r.advance(1.0/60.0,true);}assert!(r.active());assert!(!r.charging());assert_eq!(r.speed_multiplier(),1.25);
  for _ in 0..241{r.advance(1.0/60.0,true);}assert!(!r.active());assert!(r.cooldown>52.0);
  r.requested=true;for _ in 0..4000{r.advance(1.0/60.0,true);}assert!(!r.active());
  r.requested=false;r.advance(0.01,true);r.requested=true;assert!(r.advance(0.01,true));
 }
 #[test]fn ramp_preserves_timer_but_braking_cancels_without_refunding(){let mut r=RamState::default();r.requested=true;r.advance(0.016,true);r.blocked="AIRBORNE";r.advance(0.016,false);assert!(r.active());r.blocked="BRAKES";r.advance(0.016,false);assert!(!r.active());assert!(r.cost_due);assert!(r.cooldown>59.0);}
}
