import {MODEL_ASSETS, newModel, validateModel, modelAsset, modelSolid, type ModelPlacement} from './models/modelCatalog.ts';
import {ROAD_ASSETS, newRoad, validateRoad, roadAsset, roleSolid, type RoadPlacement} from './roads/roadCatalog.ts';
import {objectCorners} from './roads/layoutSnapping.ts';
import {EXTRA_PIECES} from './libraryCatalog.ts';
import {VEHICLE_ASSETS, validateVehicle, type VehiclePlacement} from './vehicles/vehicleCatalog.ts';
// Layouts use runtime metres and Y-up throughout. Unlike the legacy map boxes,
// these transforms never pass through the Blender-axis conversion.
export type V3 = [number, number, number];
export type LayoutPart = {
  shape: 'box' | 'wedge'; position: V3; size: V3; color?: string; solid?: boolean;
};
export type LayoutObject = {
  id: string; name: string; piece: string; position: V3; size: V3;
  yaw: number; color: string; locked: boolean; solid: boolean; parts: LayoutPart[]; road?: RoadPlacement; model?: ModelPlacement; vehicle?: VehiclePlacement;
};
export type WorldLayout = {
  format: 'avenlab-world-layout'; version: 1; map_id: string; title: string; base: 'replace' | 'overlay'; ground?: boolean; repeat?: boolean; objects: LayoutObject[];
};
export type Piece = {
  id: string; label: string; category: 'roads' | 'structures' | 'props' | 'chunks2' | 'chunks3' | 'blocks' | 'buildings' | 'garages' | 'objectives' | 'jumps' | 'vehicles';
  description: string; size: V3; color: string; parts: LayoutPart[]; road?: RoadPlacement; model?: ModelPlacement; vehicle?: VehiclePlacement; solid?: boolean;
};
const box = (position: V3 = [0, .5, 0], size: V3 = [1, 1, 1], color?: string, solid = true): LayoutPart =>
  ({shape: 'box', position, size, ...(color ? {color} : {}), ...(solid ? {} : {solid: false})});
export const PIECES: Piece[] = [
  ...EXTRA_PIECES,
  ...VEHICLE_ASSETS.map(a=>({id:`vehicle-${a.id}`,label:`${a.label} background`,category:'vehicles' as const,description:'Static background vehicle · shared visual model · no driving or physics',size:a.size,color:a.color,parts:[],solid:false,vehicle:{asset:a.id,lod:'auto' as const}})),
  ...MODEL_ASSETS.map(asset=>({id:`prefab-${asset.id}`,label:asset.label,category:'structures' as const,description:'The actual selection-screen garage · measured structure · open interior',size:asset.size,color:'#50769b',parts:[],model:newModel(asset)})),
  ...ROAD_ASSETS.map(asset => ({id: `glb-${asset.id}`, label: asset.label, category: 'roads' as const, description: 'Measured GLB · LOD0 collision surfaces · configurable sidewalks', size: asset.size, color: '#455466', parts: [], road: newRoad(asset)})),
  {id: 'road', label: 'Straight road', category: 'roads', description: '12 × 24 m · two lanes', size: [12, .2, 24], color: '#414e50', parts: [
    box(), box([0, 1.012, 0], [.012, .025, .96], '#e5c775', false),
    box([-.46, 1.012, 0], [.012, .025, .96], '#d6dfd9', false), box([.46, 1.012, 0], [.012, .025, .96], '#d6dfd9', false),
  ]},
  {id: 'intersection', label: 'Intersection', category: 'roads', description: '24 × 24 m · open junction', size: [24, .2, 24], color: '#414e50', parts: [box()]},
  {id: 'sidewalk', label: 'Sidewalk', category: 'roads', description: '3 × 24 m · raised edge', size: [3, .25, 24], color: '#a3a69a', parts: [box()]},
  {id: 'building', label: 'Building', category: 'structures', description: '12 × 18 × 16 m · solid block', size: [12, 18, 16], color: '#84958e', parts: [
    box([0,.48,0],[.965,.96,.965]), box([0, .98, 0], [1, .04, 1], '#bac0ae'),
    box([0, .65, .485], [.84, .045, .006], '#314a48', false), box([0, .35, .485], [.84, .045, .006], '#314a48', false),
  ]},
  {id: 'garage', label: 'Open garage', category: 'structures', description: '16 × 8 × 20 m · drive inside', size: [16, 8, 20], color: '#899a90', parts: [
    box([-.48, .47, 0], [.04, .94, 1]), box([.48, .47, 0], [.04, .94, 1]),
    box([0, .47, -.48], [.92, .94, .04]), box([0, .97, 0], [1, .06, 1], '#b5b9a4'),
    box([-.36, .35, .48], [.2, .7, .04]), box([.36, .35, .48], [.2, .7, .04]),
    box([0, .82, .48], [.52, .24, .04]),
  ]},
  {id: 'wall', label: 'Wall panel', category: 'structures', description: '12 × 6 m · leave your own gaps', size: [12, 6, .4], color: '#98a69a', parts: [box()]},
  {id: 'floor', label: 'Floor slab', category: 'structures', description: '16 × 20 m · stack storeys', size: [16, .4, 20], color: '#a4ae9d', parts: [box()]},
  {id: 'ramp', label: 'Vehicle ramp', category: 'structures', description: '8 × 4 × 16 m · rises toward −Z', size: [8, 4, 16], color: '#c2a879', parts: [{shape: 'wedge', position: [0, .5, 0], size: [1, 1, 1]}]},
  {id: 'barrier', label: 'Road barrier', category: 'props', description: '4 × 1 m · route traffic', size: [4, 1, .6], color: '#d9aa61', parts: [box(), box([0, .5, .503], [.16, .7, .01], '#4c554f', false)]},
  {id: 'crate', label: 'Supply crate', category: 'props', description: '1.5 m · cover and landmarks', size: [1.5, 1.5, 1.5], color: '#a7a17a', parts: [box(), box([0, .5, .505], [.07, .98, .012], '#56645a', false)]},
  {id: 'bollard', label: 'Bollard', category: 'props', description: '0.4 × 1.2 m · protect an edge', size: [.4, 1.2, .4], color: '#c7ab6c', parts: [box()]},
  {id: 'lamp', label: 'Street light', category: 'props', description: '7 m · grouped pole and head', size: [2.5, 7, .6], color: '#5c7066', parts: [
    box([-.4, .48, 0], [.06, .96, .22]), box([0, .94, 0], [.86, .035, .22]),
    box([.36, .92, 0], [.25, .04, .65], '#d4d6a5'),
  ]},
];
export const MAX_LAYOUT_OBJECTS = 512, MAX_LAYOUT_PARTS = 4096, MAX_LAYOUT_BYTES = 2 * 1024 * 1024;
export const pieceById = (id: string) => PIECES.find(piece => piece.id === id);
export const snap = (value: number, step: number) => Number((Math.round(value / step) * step).toFixed(6));
export const degrees = (value: number) => ((value + 180) % 360 + 360) % 360 - 180;
const object = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Expected a layout object');
  return value as Record<string, unknown>;
};
const vector = (value: unknown, min: number, max: number): value is V3 =>
  Array.isArray(value) && value.length === 3 && value.every(n => typeof n === 'number' && Number.isFinite(n) && n >= min && n <= max);
const color = (value: unknown) => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);
export function parseLayout(value: unknown, mapId?: string): WorldLayout {
  const doc = object(value);
  if (doc.format !== 'avenlab-world-layout' || doc.version !== 1) throw Error('Choose an AvenLab layout JSON file');
  if (typeof doc.map_id !== 'string' || !/^[\w-]{1,96}$/.test(doc.map_id) || (mapId && doc.map_id !== mapId)) throw Error('Layout belongs to a different map');
  if (typeof doc.title !== 'string' || !doc.title.trim() || doc.title.length > 80) throw Error('Use a layout name of 1–80 characters');
  if (doc.base !== 'replace' && doc.base !== 'overlay') throw Error('Choose a standalone layout or a city overlay');
  if (doc.repeat !== undefined && typeof doc.repeat !== 'boolean') throw Error('Invalid tile repetition setting');
  if (doc.ground !== undefined && typeof doc.ground !== 'boolean') throw Error('Invalid support ground setting');
  if (!Array.isArray(doc.objects) || doc.objects.length > MAX_LAYOUT_OBJECTS) throw Error(`Layout limit: ${MAX_LAYOUT_OBJECTS} pieces`);
  let parts = 0; const ids = new Set<string>();
  for (const entry of doc.objects) {
    const item = object(entry);
    if (typeof item.id !== 'string' || !/^[\w-]{1,96}$/.test(item.id) || ids.has(item.id)) throw Error('Invalid or duplicate piece ID');
    ids.add(item.id);
    if (typeof item.name !== 'string' || !item.name.trim() || item.name.length > 80 || typeof item.piece !== 'string' || !/^[\w-]{1,64}$/.test(item.piece)) throw Error('Invalid piece name');
    if (!vector(item.position, -100000, 100000) || !vector(item.size, .02, 512) || typeof item.yaw !== 'number' || !Number.isFinite(item.yaw) || Math.abs(item.yaw) > 36000) throw Error('Piece dimensions or position are out of range');
    if (!color(item.color) || typeof item.locked !== 'boolean' || typeof item.solid !== 'boolean') throw Error('Invalid piece appearance or collision setting');
    if ([item.road,item.model,item.vehicle].filter(v=>v!==undefined).length>1) throw Error('Choose one asset type per piece');
    if (item.vehicle !== undefined) {validateVehicle(item.vehicle);if(item.piece!==`vehicle-${item.vehicle.asset}`||item.solid)throw Error('Background vehicles must remain decorative');}
    if (item.model !== undefined) {validateModel(item.model);if(item.road!==undefined||item.piece!==`prefab-${item.model.asset}`)throw Error('Prefab piece and asset must agree');parts+=modelAsset(item.model.asset)!.colliders.filter(c=>modelSolid(c.role,item.model as ModelPlacement)).length;}
    if (item.road !== undefined) {validateRoad(item.road); if (item.piece !== `glb-${item.road.asset}`) throw Error('Road piece and asset must agree'); parts += roadAsset(item.road.asset)!.colliders.filter(c=>roleSolid(c.role,item.road as RoadPlacement)).length;}
    if (!Array.isArray(item.parts) || ((item.road || item.model || item.vehicle) ? item.parts.length !== 0 : !item.parts.length) || item.parts.length > 32) throw Error('Each piece needs 1–32 explicit shapes');
    parts += item.parts.length;
    for (const entry of item.parts) {
      const part = object(entry);
      if (!['box', 'wedge'].includes(String(part.shape)) || !vector(part.position, -2, 2) || !vector(part.size, .001, 4) || (part.color !== undefined && !color(part.color)) || (part.solid !== undefined && typeof part.solid !== 'boolean')) throw Error('Invalid piece shape');
    }
  }
  if (parts > MAX_LAYOUT_PARTS) throw Error(`Layout limit: ${MAX_LAYOUT_PARTS} shapes`);
  return structuredClone(doc) as WorldLayout;
}
export function parseLayoutText(text: string, mapId?: string) {
  if (new TextEncoder().encode(text).length > MAX_LAYOUT_BYTES) throw Error('Layout JSON exceeds 2 MiB');
  return parseLayout(JSON.parse(text), mapId);
}
export const layoutJSON = (doc: WorldLayout) => JSON.stringify(parseLayout(doc), null, 2) + '\n';
export const emptyLayout = (mapId: string): WorldLayout => ({format: 'avenlab-world-layout', version: 1, map_id: mapId, title: 'Untitled district', base: 'replace', objects: []});
export const initialMapLayout = (mapId:string, source?:unknown):unknown => source??({...emptyLayout(mapId),title:mapId.replaceAll('_',' '),base:'overlay'});
export function addPiece(doc: WorldLayout, pieceId: string, position: V3, yaw = 0): WorldLayout {
  const piece = pieceById(pieceId); if (!piece) throw Error('Choose a piece from the library');
  const ids = new Set(doc.objects.map(o => o.id)); let n = 1; while (ids.has(`${pieceId}-${n}`)) n++;
  return parseLayout({...doc, ...((piece.road || piece.model) && !doc.objects.length ? {ground: false, repeat: false} : {}), objects: [...doc.objects, {id: `${pieceId}-${n}`, name: `${piece.label} ${n}`, piece: pieceId, position, size: [...piece.size], yaw: degrees(yaw), color: piece.color, locked: false, solid: piece.solid!==false, parts: structuredClone(piece.parts), ...(piece.road ? {road: structuredClone(piece.road)} : {}), ...(piece.model ? {model:structuredClone(piece.model)} : {}),...(piece.vehicle?{vehicle:structuredClone(piece.vehicle)}:{})}]});
}
export function updatePiece(doc: WorldLayout, id: string, changes: Partial<Pick<LayoutObject, 'name' | 'position' | 'size' | 'yaw' | 'color' | 'locked' | 'solid' | 'road' | 'model' | 'vehicle'>>) {
  const selected = doc.objects.find(o => o.id === id);
  if (!selected) throw Error('Select a piece first');
  if (selected.locked && Object.keys(changes).some(key => key !== 'locked')) throw Error('Unlock this piece before editing');
  return parseLayout({...doc, objects: doc.objects.map(o => o.id === id ? {...o, ...changes, ...(changes.yaw === undefined ? {} : {yaw: degrees(changes.yaw)})} : o)});
}
export function duplicatePiece(doc: WorldLayout, id: string, step: number) {
  const source = doc.objects.find(o => o.id === id); if (!source) throw Error('Select a piece first');
  const ids = new Set(doc.objects.map(o => o.id)); let n = 1; while (ids.has(`${source.piece}-copy-${n}`)) n++;
  return parseLayout({...doc, objects: [...doc.objects, {...structuredClone(source), id: `${source.piece}-copy-${n}`, name: `${source.name.slice(0, 71)} copy`, locked: false, position: [source.position[0] + step, source.position[1], source.position[2] + step]}]});
}
export function removePiece(doc: WorldLayout, id: string) {
  if (doc.objects.find(o => o.id === id)?.locked) throw Error('Unlock this piece before deleting');
  return {...doc, objects: doc.objects.filter(o => o.id !== id)};
}
// World-space part transforms are shared by the instanced renderer and tests.
export function partTransform(item: LayoutObject, part: LayoutPart): {position: V3; size: V3; yaw: number} {
  const angle = item.yaw * Math.PI / 180, c = Math.cos(angle), s = Math.sin(angle);
  const p = part.position.map((n, i) => n * item.size[i]);
  return {position: [item.position[0] + c * p[0] + s * p[2], item.position[1] + p[1], item.position[2] - s * p[0] + c * p[2]], size: part.size.map((n, i) => n * item.size[i]) as V3, yaw: angle};
}
export function footprint(item: LayoutObject): [number, number][] {
  return objectCorners(item);
}
export function exampleLayout(mapId: string, surface = 0) {
  let doc = emptyLayout(mapId);
  const put = (piece: string, at: V3, yaw = 0) => {doc = addPiece(doc, piece, [at[0], at[1] + surface, at[2]], yaw);};
  put('road', [0, -.2, 0]); put('road', [0, -.2, 24]); put('intersection', [0, -.2, -24]);
  put('sidewalk', [-7.5, 0, 6]); put('sidewalk', [7.5, 0, 6]);
  put('garage', [-20, 0, -14], 90); put('building', [22, 0, -24]);
  put('building', [24, 0, 4]); put('ramp', [-20, 0, 10]);
  put('floor', [-20, 3.6, -8]); put('barrier', [6, 0, -14], 25);
  put('lamp', [-9, 0, -3], 180); put('lamp', [9, 0, 20]);
  put('crate', [-10, 0, 24]); put('crate', [-10, 0, 26]);
  return {...doc, title: 'Switchback district'};
}
