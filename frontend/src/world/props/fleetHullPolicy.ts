import type {Object3D} from 'three';
import type {CityQuality} from '../cityLod';

/** Null means load only the reduced hull, not both LODs hidden in the scene.
 * Full detail remains available through the existing Original preset. */
export function fleetDetailDistance(quality:CityQuality,originalDistance:number):number|null{
  if(quality==='fast')return null;
  return quality==='balanced'?Math.min(originalDistance,160):originalDistance;
}

/** Static docked hulls share cached geometry/materials, but never scene nodes.
 * Bake each local matrix once. Parent placement/yaw still updates world
 * matrices normally, so moving a World Builder prefab continues to work. */
export function cloneStaticHull(source:Object3D):Object3D{
  const instance=source.clone(true);
  instance.traverse(node=>{
    node.updateMatrix();
    node.matrixAutoUpdate=false;
  });
  return instance;
}
