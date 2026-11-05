import type {PhysicsSnapshot} from '../../store/session/networkStore';
const raised=Math.PI/6;
export function bridgeAngle(tick:number,motion?:PhysicsSnapshot['drawbridge']) {
  if(!motion){
    const wave=Math.max(0,Math.sin(2*Math.PI*(tick%1200)/1200));
    return wave*wave*raised;
  }
  const travel=Math.max(0,tick-motion.start_tick)*raised/150;
  return motion.start_angle+Math.max(-travel,Math.min(travel,motion.target_angle-motion.start_angle));
}
