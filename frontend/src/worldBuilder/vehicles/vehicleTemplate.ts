import {Box3,Group,Vector3} from 'three';
import {prepareVehicleVisual} from '../../vehicles/tools/vehicleMaterials.ts';

export function normalizedVehicleTemplate(scene:Group,id:string,sourceYaw:number){
 const display=prepareVehicleVisual(scene,id);
 display.root.rotation.y+=sourceYaw;display.root.updateMatrixWorld(true);
 const bounds=new Box3().setFromObject(display.root),size=bounds.getSize(new Vector3()),center=bounds.getCenter(new Vector3());
 if(![size.x,size.y,size.z].every(v=>Number.isFinite(v)&&v>.00001))throw Error('Vehicle visual has no usable bounds');
 // Keep the imported hierarchy. Baking negative scales into vertices would
 // reverse mirrored Supra wheel/body faces without the renderer's face flip.
 const root=new Group();root.name='normalized-vehicle-template';
 root.scale.set(1/size.x,1/size.y,1/size.z);
 root.position.set(-center.x/size.x,-bounds.min.y/size.y,-center.z/size.z);
 root.add(display.root);root.updateMatrixWorld(true);
 return root;
}
