/** Match Rust ballistics.rs. Gravity-only arcade shell; no air drag/wind. */
export const CANNON_SPEED=180, GRAVITY=9.81, MAX_FLIGHT_TIME=8;
export type Vec3=readonly [number,number,number];
export function ballisticPoint(origin:Vec3,direction:Vec3,time:number):[number,number,number]{return [origin[0]+direction[0]*CANNON_SPEED*time,origin[1]+direction[1]*CANNON_SPEED*time-.5*GRAVITY*time*time,origin[2]+direction[2]*CANNON_SPEED*time];}
export function planeFlight(pitch:number,height:number){const vy=CANNON_SPEED*Math.sin(pitch),discriminant=vy*vy+2*GRAVITY*Math.max(0,height);const ideal=(vy+Math.sqrt(discriminant))/GRAVITY,time=Math.min(MAX_FLIGHT_TIME,ideal);return {time,range:CANNON_SPEED*Math.cos(pitch)*time,capped:ideal>MAX_FLIGHT_TIME};}
export function elevationForRange(range:number,height:number){if(range<=0)return null;const v2=CANNON_SPEED*CANNON_SPEED,d=v2*v2-GRAVITY*(GRAVITY*range*range-2*height*v2);return d<0?null:Math.atan((v2-Math.sqrt(d))/(GRAVITY*range));}
