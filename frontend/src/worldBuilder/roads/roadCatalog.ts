import data from '../../../../avenlab-server/src/assets/roads/road-colliders.json' with {type: 'json'};
import {defaultVariant, type Bounds, type RoadId, type Role, type Variant, type Vec3} from '../roadKit/roadKitCore.ts';
export type RoadCollider = {role: Role; vertices: Vec3[]; indices: [number, number, number][]};
export type RoadAsset = {id: RoadId; label: string; lods: {lod: number; url: string; sha256: string}[]; origin: Vec3; source_yaw: number; size: Vec3; bounds: Bounds; surface: Bounds; colliders: RoadCollider[]};
export type RoadPlacement = {
  asset: RoadId; source_sha256: string; variant: Variant;
  collision: {surface: boolean; curbs: boolean; paving: boolean}; lod: 'auto' | 0 | 1 | 2;
};
export const ROAD_ASSETS = data.assets as unknown as RoadAsset[];
export const roadAsset = (id: string) => ROAD_ASSETS.find(asset => asset.id === id);
export function newRoad(asset: RoadAsset): RoadPlacement {
  return {asset: asset.id, source_sha256: asset.lods[0].sha256, variant: defaultVariant(), collision: {surface: true, curbs: true, paving: true}, lod: 'auto'};
}
export function validateRoad(value: unknown): asserts value is RoadPlacement {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Invalid road settings');
  const r = value as RoadPlacement, asset = roadAsset(r.asset);
  if (!asset || r.source_sha256 !== asset.lods[0].sha256) throw Error('Road collision catalog does not match this asset revision');
  if (!r.variant || !r.collision || !['source','one-way-forward','one-way-reverse','two-way'].includes(r.variant.flow)) throw Error('Invalid road variant');
  for (const key of ['left','right','nw','ne','sw','se','markings','details'] as const) if (typeof r.variant[key] !== 'boolean') throw Error('Invalid road visibility mask');
  for (const key of ['surface','curbs','paving'] as const) if (typeof r.collision[key] !== 'boolean') throw Error('Invalid road collision mask');
  if (!['auto',0,1,2].includes(r.lod)) throw Error('Invalid road LOD');
}
export function roleVisible(role: Role, variant: Variant) {
  if (role === 'surface') return true;
  if (role === 'markings' || role === 'details') return variant[role];
  return variant[role.split('-')[0] as 'left'|'right'|'nw'|'ne'|'sw'|'se'];
}
export function roleSolid(role: Role, road: RoadPlacement) {
  return roleVisible(role, road.variant) && (role === 'surface' ? road.collision.surface : role.endsWith('-curb') ? road.collision.curbs : role.endsWith('-paving') ? road.collision.paving : false);
}
const groupBounds=new WeakMap<RoadCollider,Bounds>();
function meshBounds(mesh:RoadCollider):Bounds {
  let b=groupBounds.get(mesh);if(b)return b;
  b={min:[0,1,2].map(i=>Math.min(...mesh.vertices.map(v=>v[i]))) as Vec3,max:[0,1,2].map(i=>Math.max(...mesh.vertices.map(v=>v[i]))) as Vec3};groupBounds.set(mesh,b);return b;
}
export function roadBounds(road: RoadPlacement, basis: 'asphalt' | 'outer' = 'outer'): Bounds {
  const asset = roadAsset(road.asset)!;
  if (basis === 'asphalt') return asset.surface;
  const bounds=asset.colliders.filter(c=>roleVisible(c.role,road.variant)).map(meshBounds);
  return {min:[0,1,2].map(i=>Math.min(...bounds.map(b=>b.min[i]))) as Vec3,max:[0,1,2].map(i=>Math.max(...bounds.map(b=>b.max[i]))) as Vec3};
}
export function roleAt(material: string, x: number, z: number, asset: RoadId): Role {
  if (material === 'asphalt_01') return 'surface';
  if (material === 'MarkingRoad') return 'markings';
  if (/^Sidewalk_/.test(material)) return `${asset === 'intersection' ? `${z < 0 ? 'n' : 's'}${x < 0 ? 'w' : 'e'}` : x < 0 ? 'left' : 'right'}-${material === 'Sidewalk_02' ? 'curb' : 'paving'}` as Role;
  return 'details';
}
