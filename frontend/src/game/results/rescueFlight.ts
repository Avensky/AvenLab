// Metres in a side view of the harbor. The helicopter meets the roof at the
// apex, then both follow one flight path so the sling cannot detach mid-shot.
export const RESCUE_DURATION=8;
const ease=(x:number)=>{const t=Math.max(0,Math.min(1,x));return t*t*(3-2*t);};
export function rescueFlight(time:number) {
  const t=Math.max(0,Math.min(time,RESCUE_DURATION));
  const jump=Math.max(0,Math.min(1,(t-2.2)/1.6)), fly=ease((t-3.8)/4.2);
  const approach=Math.min(t,2.2)/2.2;
  const x=t<2.2?-12+8*approach:-4+7*jump+14*fly;
  const y=t<2.2?1.2+1.25*ease(approach):2.45+3.15*Math.sin(jump*Math.PI/2)+4*fly;
  const rendezvous=ease((t-.9)/2.9);
  return {x,y, helicopterX:t<3.8?10-7*rendezvous:x, helicopterY:t<3.8?11-2.4*rendezvous:y+3,
    pitch:t<3.8?.21*Math.sin(approach*Math.PI/2)*(1-jump):-.08*Math.sin(fly*Math.PI),
    sling:ease((t-3.15)/.65), bridge:.20+.48*ease((t-2.2)/2.1)};
}
