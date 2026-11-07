import {Matrix4,Ray,Vector3,type Intersection,type Object3D,type Raycaster,type Mesh,type InstancedMesh} from 'three';

/** Visible labels take turns. Keep the total cost bounded as the roster grows. */
export class MarkerSightBudget {
  private waiting = new Set<string>();
  private next = -Infinity;

  claim(id: string, now: number) {
    this.waiting.add(id);
    if (now < this.next || this.waiting.values().next().value !== id) return false;
    this.waiting.delete(id);
    this.next = now + 1000 / 20;
    return true;
  }

  forget(id: string) { this.waiting.delete(id); }
}

// HUD occlusion is deliberately a conservative bounds test, NOT weapon hit
// detection. Exact Mesh.raycast against detailed fleet/prop geometry used to
// run up to 20 times/sec on the main thread. Server targeting is unchanged.
const inverse=new Matrix4(),instance=new Matrix4(),world=new Matrix4();
const localRay=new Ray(),hit=new Vector3(),worldHit=new Vector3(),nearPoint=new Vector3();
const MAX_BOUNDS_PER_QUERY=8192;

function intersectsBounds(mesh:Mesh,transform:Matrix4,ray:Raycaster):boolean{
  const geometry=mesh.geometry;
  if(!geometry.boundingBox)geometry.computeBoundingBox();
  const bounds=geometry.boundingBox;
  if(!bounds||bounds.isEmpty())return false;
  inverse.copy(transform).invert();
  localRay.copy(ray.ray).applyMatrix4(inverse);
  // intersectBox returns the EXIT when the origin lies inside. A distant exit
  // must not reveal labels through a merged hull around both camera and target.
  // Bounds can hide labels earlier than exact geometry, never grant targeting.
  ray.ray.at(ray.near,nearPoint).applyMatrix4(inverse);
  if(bounds.containsPoint(nearPoint))return true;
  if(!localRay.intersectBox(bounds,hit))return false;
  worldHit.copy(hit).applyMatrix4(transform);
  const distance=worldHit.distanceTo(ray.ray.origin);
  return distance>=ray.near && distance<=ray.far;
}

/** One bounded traversal with no per-mesh hit arrays; never call mesh.raycast.
 * Respect hidden/transparent groups and camera layers. Instanced props use
 * each instance's transform, never a giant box around the whole city. */
export function hasSightBlocker(node:Object3D,ray:Raycaster,hits:Intersection[]):boolean{
  hits.length=0;
  let tested=0;
  const visit=(object:Object3D):boolean=>{
    if(!object.visible||object.userData.hudSightTransparent===true)return false;
    const mesh=object as Mesh;
    if(mesh.isMesh&&object.layers.test(ray.layers)){
      const instanced=mesh as InstancedMesh;
      if(instanced.isInstancedMesh){
        for(let index=0;index<instanced.count;index++){
          if(++tested>MAX_BOUNDS_PER_QUERY)return true;
          instanced.getMatrixAt(index,instance);
          world.multiplyMatrices(object.matrixWorld,instance);
          if(intersectsBounds(mesh,world,ray))return true;
        }
      }else{
        if(++tested>MAX_BOUNDS_PER_QUERY)return true;
        if(intersectsBounds(mesh,object.matrixWorld,ray))return true;
      }
    }
    for(const child of object.children)if(visit(child))return true;
    return false;
  };
  return visit(node);
}
