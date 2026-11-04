/** Projected size follows zoom. Distance keeps cars in a close fight readable
 * on small screens, even when the chase camera sits well behind the driver. */
export type FleetDetail = 'near' | 'medium' | 'far';
export type DetailCandidate = {pixels:number;distance:number;center:number;visible:boolean};
export function fleetDetail(c:DetailCandidate,previous:FleetDetail|undefined,low:boolean,scoped:boolean):FleetDetail|null {
  if(!c.visible)return null;
  const near=previous==='near';
  const distanceLimit=low ? 8 : 14;
  const pixelLimit=low ? 110 : 68;
  if(c.distance <= distanceLimit*(near?1.25:1) || c.pixels >= pixelLimit*(near?.78:1)
      || (scoped && c.center<.22 && c.pixels>=48))return 'near';
  const medium=previous==='medium'||near;
  return c.pixels>=(low?38:25)*(medium?.78:1) ? 'medium' : 'far';
}
