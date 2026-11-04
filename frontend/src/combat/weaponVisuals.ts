import {Box3, Matrix4, Object3D, Vector3, type Mesh} from 'three';

/** Render anchors belong to a mounted model, never to physics or player input. */
export const weaponVisuals=new Map<string,{cannon:Object3D;coax:Object3D;basket?:Object3D}>();

/** Measure the forward end of the actual barrel in its recoil pivot's space.
 * Baked GLB vertices can be off-centre; average only the frontmost vertex band. */
export function measureBarrelTip(barrel:Object3D,pivot:Object3D){
 pivot.updateWorldMatrix(true,true);
 const inverse=new Matrix4().copy(pivot.matrixWorld).invert(),points:Vector3[]=[];
 barrel.traverse(object=>{const mesh=object as Mesh,position=mesh.geometry?.getAttribute('position');if(!position)return;
  const matrix=new Matrix4().multiplyMatrices(inverse,object.matrixWorld);
  for(let i=0;i<position.count;i++)points.push(new Vector3().fromBufferAttribute(position,i).applyMatrix4(matrix));
 });
 if(!points.length)return new Vector3(0,0,4.1);
 const bounds=new Box3().setFromPoints(points),band=Math.max(.005,(bounds.max.z-bounds.min.z)*.01);
 const tip=new Vector3();let count=0;
 for(const point of points)if(point.z>=bounds.max.z-band){tip.add(point);count++;}
 tip.multiplyScalar(1/count);tip.z=bounds.max.z+.035;
 return tip;
}
