import {Group,Mesh,Vector3,MathUtils,type BufferGeometry,type Object3D} from 'three';

export type TankHatch={pivot:Group;axis:'x'|'y';closedAngle:number};
export type TankHatches={moving:TankHatch[];ownedGeometries:BufferGeometry[]};

/** The imported combined mesh duplicates the top lid and includes the driver's
 * sideways lid. Copy only its lower triangles; never rotate the shared top copy. */
function combinedLid(scene:Group,lower:boolean){
 const source=scene.getObjectByName('Hatch_Front_Hatch_Hull') as Mesh|undefined;
 const position=source?.geometry?.getAttribute('position');if(!source||!position)return null;
 const index=source.geometry.index,indices:number[]=[],count=index?.count??position.count;
 for(let i=0;i<count;i+=3){const triangle=[0,1,2].map(k=>index?index.getX(i+k):i+k);
  if(triangle.every(v=>lower?position.getY(v)<1.8:position.getY(v)>=1.8))indices.push(...triangle);
 }
 if(!indices.length)return null;
 const slice=source.geometry.clone();slice.setIndex(indices);
 const geometry=slice.toNonIndexed();slice.dispose();geometry.clearGroups();geometry.computeBoundingBox();geometry.computeBoundingSphere();
 const mesh=new Mesh(geometry,source.material);mesh.name=lower?'Tank_DriverHatch':'Tank_CommanderHatchOuter';
 mesh.position.copy(source.position);mesh.quaternion.copy(source.quaternion);mesh.scale.copy(source.scale);
 (source.parent??scene).add(mesh);return mesh;
}

function hinge(scene:Group,parent:Object3D,mesh:Object3D,point:Vector3,axis:'x'|'y',closedAngle:number,companions:Object3D[]=[]):TankHatch{
 scene.updateWorldMatrix(true,true);
 const pivot=new Group();pivot.name=`${mesh.name}_Hinge`;
 pivot.position.copy(parent.worldToLocal(scene.localToWorld(point.clone())));parent.add(pivot);
 pivot.updateWorldMatrix(true,false);pivot.attach(mesh);for(const companion of companions)pivot.attach(companion);pivot.rotation[axis]=closedAngle;
 return {pivot,axis,closedAngle};
}

/** Model-space pivots measured from this tank asset. Both movable lids start
 * closed. The roof MG opening is baked into Turret and stays with that mesh. */
export function createTankHatches(scene:Group,turret:Group):TankHatches{
 const moving:TankHatch[]=[],upper=scene.getObjectByName('Hatch_Hull'),outer=combinedLid(scene,false);
 if(upper)moving.push(hinge(scene,turret,upper,new Vector3(.506,2.024,-.145),'x',-Math.PI/2,outer?[outer]:[]));
 const lower=combinedLid(scene,true);
 if(lower)moving.push(hinge(scene,scene,lower,new Vector3(.625,1.35,1.17),'y',-88*Math.PI/180));
 return {moving,ownedGeometries:[outer?.geometry,lower?.geometry].filter((g):g is BufferGeometry=>Boolean(g))};
}

export function advanceTankHatches(hatches:TankHatches,combat:boolean,dt:number){
 if(!Number.isFinite(dt)||dt<=0)return;
 for(const hatch of hatches.moving){const target=combat?hatch.closedAngle:0;
  hatch.pivot.rotation[hatch.axis]=MathUtils.damp(hatch.pivot.rotation[hatch.axis],target,14,Math.min(dt,.1));
 }
}
