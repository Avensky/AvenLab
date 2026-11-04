import {BufferGeometry,Group,Mesh,Vector3,type Object3D} from 'three';

/** Original GLB coordinates, measured from the visible eight-sided front-port
 * barrel. The interior export is offset; effects must leave the exterior tip.
 * Rust basket weapon uses these same base/muzzle coordinates and yaw/pitch math. */
export const TANK_FORWARD_GUN_BASE=[-.3388,1.4641,1.2020] as const;
export const TANK_FORWARD_GUN_MUZZLE=[-.3396,1.4700,1.3741] as const;
export const TANK_TURRET_PIVOT=[0,1.30,.10] as const;
type Bounds={min:readonly number[];max:readonly number[]};
const EXTERIOR_BARREL:Bounds={min:[-.360,1.44,1.19],max:[-.320,1.50,1.35]};
const INTERIOR_GUN:Bounds={min:[-.370,.88,.43],max:[-.100,1.58,1.18]};

/** Split only triangles wholly inside a measured hardware region. Shared GLTF
 * geometry/materials are never changed; both derived geometries are owned by
 * this mounted tank and disposed with it. Unrelated basket hardware stays put. */
function extractGun(source:Object3D|undefined,bounds:Bounds,owned:BufferGeometry[]){
 const mesh=source as Mesh|undefined,position=mesh?.geometry?.getAttribute('position');
 if(!mesh||!position)return null;
 const original=mesh.geometry,index=original.index,count=index?.count??position.count;
 const selected:number[]=[],remaining:number[]=[];
 const inside=(vertex:number)=>position.getX(vertex)>=bounds.min[0]&&position.getX(vertex)<=bounds.max[0]&&position.getY(vertex)>=bounds.min[1]&&position.getY(vertex)<=bounds.max[1]&&position.getZ(vertex)>=bounds.min[2]&&position.getZ(vertex)<=bounds.max[2];
 for(let i=0;i+2<count;i+=3){const a=index?index.getX(i):i,b=index?index.getX(i+1):i+1,c=index?index.getX(i+2):i+2;(inside(a)&&inside(b)&&inside(c)?selected:remaining).push(a,b,c);}
 if(selected.length===0||remaining.length===0)return null;
 const slice=(indices:number[])=>{const temporary=original.clone();temporary.setIndex(indices);const geometry=temporary.toNonIndexed();temporary.dispose();geometry.clearGroups();geometry.computeBoundingBox();geometry.computeBoundingSphere();owned.push(geometry);return geometry;};
 mesh.geometry=slice(remaining);
 const gun=new Mesh(slice(selected),mesh.material);gun.name=`${mesh.name}_ForwardGun`;
 gun.position.copy(mesh.position);gun.quaternion.copy(mesh.quaternion);gun.scale.copy(mesh.scale);
 mesh.parent?.add(gun);return gun;
}

export function createTankForwardGun(scene:Group,turret:Group){
 const ownedGeometries:BufferGeometry[]=[],parts:Object3D[]=[];
 const exterior=extractGun(scene.getObjectByName('Turret'),EXTERIOR_BARREL,ownedGeometries);
 const interior=extractGun(scene.getObjectByName('Interior_TurretBasket'),INTERIOR_GUN,ownedGeometries);
 if(exterior)parts.push(exterior);if(interior)parts.push(interior);
 scene.updateMatrixWorld(true);
 const pitch=new Group();pitch.name='Tank_ForwardGunPitch';
 pitch.position.copy(new Vector3(...TANK_FORWARD_GUN_BASE).sub(new Vector3(...TANK_TURRET_PIVOT)));turret.add(pitch);
 pitch.updateWorldMatrix(true,false);for(const part of parts)pitch.attach(part);
 const muzzle=new Group();muzzle.name='Tank_ForwardGunMuzzle';
 muzzle.position.copy(new Vector3(...TANK_FORWARD_GUN_MUZZLE).sub(new Vector3(...TANK_FORWARD_GUN_BASE)));pitch.add(muzzle);
 return {pitch,muzzle,parts,ownedGeometries};
}
