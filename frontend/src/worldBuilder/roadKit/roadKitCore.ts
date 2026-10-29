// Asset-space measurements, sidewalk variants, and exact source triangle sets.
// No inference about lane direction is made from road width or sidewalk state.
export type Vec3 = [number, number, number];
export type Bounds = {min: Vec3; max: Vec3};
export type RoadId = 'road_narrow' | 'road_wide' | 'intersection';
export type Role = 'surface' | 'markings' | 'details' | 'left-curb' | 'left-paving' | 'right-curb' | 'right-paving' | `${'nw'|'ne'|'sw'|'se'}-${'curb'|'paving'}`;
export type RawPart = {id: string; sourceNode: string; material: string; positions: number[]; indices: number[]};
export type RoadPart = RawPart & {role: Role; bounds: Bounds};
export type RoadTemplate = {id: RoadId; origin: Vec3; sourceYaw: number; surface: Bounds; parts: RoadPart[]; sourceNodes: number};
export type Variant = {left: boolean; right: boolean; nw: boolean; ne: boolean; sw: boolean; se: boolean; markings: boolean; details: boolean; flow: 'source'|'one-way-forward'|'one-way-reverse'|'two-way'};
export const defaultVariant = (): Variant => ({left:true,right:true,nw:true,ne:true,sw:true,se:true,markings:true,details:true,flow:'source'});
export function boundsOf(parts: {positions: number[]}[]): Bounds {
 const min: Vec3=[Infinity,Infinity,Infinity],max: Vec3=[-Infinity,-Infinity,-Infinity];
 for(const part of parts)for(let i=0;i<part.positions.length;i++){const k=i%3,v=part.positions[i];if(!Number.isFinite(v))throw Error('Non-finite mesh vertex');min[k]=Math.min(min[k],v);max[k]=Math.max(max[k],v);}
 if(!Number.isFinite(min[0]))throw Error('No geometry to measure');
 return {min,max};
}
export function prepareRoadTemplate(id: RoadId, raw: RawPart[]): RoadTemplate {
 const asphalt=raw.filter(p=>p.material==='asphalt_01');if(!asphalt.length)throw Error('Road surface material missing');
 const source=boundsOf(asphalt),origin=source.min.map((v,i)=>(v+source.max[i])/2) as Vec3;
 const turn=id==='road_wide',sourceYaw=turn?Math.PI/2:0;
 const parts: RoadPart[]=raw.map(part=>{
  if(part.positions.length%3||part.indices.length%3||part.indices.some(i=>!Number.isInteger(i)||i<0||i>=part.positions.length/3))throw Error('Invalid source triangle indices');
  const positions=[];
  for(let i=0;i<part.positions.length;i+=3){const x=part.positions[i]-origin[0],y=part.positions[i+1]-origin[1],z=part.positions[i+2]-origin[2];positions.push(turn?z:x,y,turn?-x:z);}
  const bounds=boundsOf([{positions}]),x=(bounds.min[0]+bounds.max[0])/2,z=(bounds.min[2]+bounds.max[2])/2;
  let role: Role='details';
  if(part.material==='asphalt_01')role='surface';
  else if(part.material==='MarkingRoad')role='markings';
  else if(part.material.startsWith('Sidewalk_')){
   const kind=part.material==='Sidewalk_02'?'curb':'paving';
   role=id==='intersection'?`${z<0?'n':'s'}${x<0?'w':'e'}-${kind}`:`${x<0?'left':'right'}-${kind}` as Role;
  }
  return {...part,positions,indices:[...part.indices],role,bounds};
 });
 return {id,origin,sourceYaw,surface:boundsOf(parts.filter(p=>p.role==='surface')),parts,sourceNodes:new Set(raw.map(p=>p.sourceNode)).size};
}
export function partEnabled(part: RoadPart, variant: Variant) {
 const role=part.role;
 if(role==='markings')return variant.markings;
 if(role==='details')return variant.details;
 if(role==='surface')return true;
 return variant[role.split('-')[0] as 'left'|'right'|'nw'|'ne'|'sw'|'se'];
}
export function collisionParts(template: RoadTemplate, variant: Variant) {
 return template.parts.filter(p=>p.role!=='markings'&&p.role!=='details'&&partEnabled(p,variant));
}
export function variantBounds(template: RoadTemplate, variant: Variant, basis: 'asphalt'|'outer'='outer') {
 return basis==='asphalt'?template.surface:boundsOf(collisionParts(template,variant));
}
export function dimensions(bounds: Bounds) {return bounds.max.map((v,i)=>v-bounds.min[i]) as Vec3;}
export function blockClearance(template: RoadTemplate, centerWidth: number, centerDepth: number, inward: 'left'|'right', sidewalk=true) {
 if(![centerWidth,centerDepth].every(v=>Number.isFinite(v)&&v>0))throw Error('Use positive road-center distances');
 if(template.id==='intersection')throw Error('Choose a straight corridor for a block frontage');
 const variant=defaultVariant();variant[inward]=sidewalk;
 const b=variantBounds(template,variant),offset=inward==='left'?-b.min[0]:b.max[0];
 const width=centerWidth-2*offset,depth=centerDepth-2*offset;
 return {width,depth,area:Math.max(0,width)*Math.max(0,depth),inwardOffset:offset,valid:width>0&&depth>0,
  polygon:[[-width/2,-depth/2],[width/2,-depth/2],[width/2,depth/2],[-width/2,depth/2]]};
}
export function exportRoadTemplate(template: RoadTemplate, variant: Variant, sourceHash: string) {
 return {format:'avenlab-road-collider-template',version:1,asset:template.id,source_sha256:sourceHash,
  coordinates:{units:'meters',up_axis:'y',forward_axis:'-z'},source_normalization:{origin:template.origin,yaw_radians:template.sourceYaw},
  variant,bounds:variantBounds(template,variant),snap_basis:{asphalt:template.surface,outer:variantBounds(template,variant)},
  collision_kind:'static_trimesh',colliders:collisionParts(template,variant).map(p=>({id:p.id,source_node:p.sourceNode,role:p.role,vertices:p.positions,indices:p.indices})),
  runtime_status:'Authoring template. Requires a triangle-mesh road loader; not a schema 2 map replacement.'};
}
