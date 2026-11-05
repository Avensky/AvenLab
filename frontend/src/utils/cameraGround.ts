import {roadAsset} from '../worldBuilder/roads/roadCatalog.ts';
import type {MapSnapshot} from '../store/world/worldStore';

type Patch = {x:number; z:number; hx:number; hz:number; sin:number; cos:number; top:number};
const cache = new WeakMap<MapSnapshot, {patches:Patch[]; floor:number}>();

function supports(map:MapSnapshot) {
  const cached = cache.get(map);
  if (cached) return cached;
  const patches: Patch[] = [];
  const layout = map.authored_layout;
  const origin = map.layout.kind === 'fixed_grid' ? map.layout.origin : [0,0];
  const baseX = origin[0]*map.cell[0], baseZ = origin[1]*map.cell[1];
  if (layout?.repeat === false) {
    for (const o of layout.objects) {
      if (o.road?.collision.surface) {
        const asset=roadAsset(o.road.asset);
        if (!asset) continue;
        const {min,max}=asset.surface;
        const angle=o.yaw*Math.PI/180, cos=Math.cos(angle), sin=Math.sin(angle);
        const sx=o.size[0]/asset.size[0], sz=o.size[2]/asset.size[2];
        const cx=(min[0]+max[0])*sx/2, cz=(min[2]+max[2])*sz/2;
        patches.push({x:baseX+o.position[0]+cos*cx+sin*cz,z:baseZ+o.position[2]-sin*cx+cos*cz,
          hx:(max[0]-min[0])*sx/2,hz:(max[2]-min[2])*sz/2,sin,cos,top:o.position[1]+max[1]*o.size[1]/asset.size[1]});
        continue;
      }
      if (!['coastal-land','coastal-land-bridge','coastal-water-visual','harbor-seabed'].includes(o.piece)) continue;
      const angle = o.yaw*Math.PI/180;
      patches.push({x:baseX+o.position[0],z:baseZ+o.position[2],hx:o.size[0]/2,hz:o.size[2]/2,
        sin:Math.sin(angle),cos:Math.cos(angle),top:o.position[1]+o.size[1]});
    }
  }
  if (layout?.base !== 'replace') {
    for (const chunk of map.collider_chunks ?? []) for (const box of chunk.boxes) {
      if (box.kind !== 'road' && box.kind !== 'intersection') continue;
      patches.push({x:box.center[0],z:box.center[2],hx:box.half_extents[0],hz:box.half_extents[2],
        sin:0,cos:1,top:box.center[1]+box.half_extents[1]});
    }
  }
  const floor = layout?.objects.some(o=>o.piece==='harbor-seabed') ? Math.min(...patches.map(p=>p.top)) : -Infinity;
  const ground = {patches,floor};
  cache.set(map,ground);
  return ground;
}

/** Minimum eye height at this X/Z. Bridges and roofs above a camera are not terrain. */
export function cameraGround(map: MapSnapshot | null, x:number, z:number) {
  if (!map) return -Infinity;
  let top = map.authored_layout?.ground === false ? -Infinity : map.surface.road_y;
  const {patches,floor} = supports(map);
  for (const p of patches) {
    const dx=x-p.x, dz=z-p.z;
    if (Math.abs(p.cos*dx-p.sin*dz)<=p.hx && Math.abs(p.sin*dx+p.cos*dz)<=p.hz) top=Math.max(top,p.top);
  }
  // Just outside a finite shoreline there may be no painted water tile.
  // Keep the spectator above the deepest seabed through an out-of-bounds fall.
  return Math.max(top,floor) + .35;
}
