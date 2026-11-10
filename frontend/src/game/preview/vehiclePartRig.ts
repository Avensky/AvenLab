import {Box3,Group,Matrix4,Mesh,Vector3,type Object3D} from "three";
import type {VehicleStudioPart} from "../heroes/vehicleStudioStore";

export type VehiclePartHinge={part:VehicleStudioPart;pivot:Group;axis:"x"|"y"|"z";closed:number;open:number;angle:number};
const rules:Partial<Record<VehicleStudioPart,RegExp>>={
 "door-left":/^(?:.*_)?door(?:_?glass)?[_ .-]*(?:left|l)(?:[_ .-].*)?$/i,
 "door-right":/^(?:.*_)?door(?:_?glass)?[_ .-]*(?:right|r)(?:[_ .-].*)?$/i,
 hood:/hood/i,
 trunk:/^(?:.*_)?(?:trunk|boot)(?:[_ .-](?!arms?).*)?$/i,
 headlights:/^(?:headlights?|headlightlenses)$/i,
};
function boundsInRoot(root:Object3D,objects:Object3D[]){
 root.updateWorldMatrix(true,true);const inverse=root.matrixWorld.clone().invert(),bounds=new Box3();
 for(const object of objects){const world=new Box3().setFromObject(object,true);world.applyMatrix4(inverse);bounds.union(world);}
 return bounds;
}
function meshCandidates(root:Object3D,part:VehicleStudioPart){
 const pattern=rules[part];if(!pattern)return [] as Mesh[];const found:Mesh[]=[];
 root.traverse(object=>{if((object as Mesh).isMesh&&pattern.test(object.name)&&!/(?:sticker|decal|latch|arm|frame)$/i.test(object.name))found.push(object as Mesh);});
 return found;
}
export function measureDriverDoor(root: Object3D) {
 const frontLeft = /(?:driver.*door|door.*driver|(?:front|f)[_ .-]*(?:left|l).*door|(?:left|l)[_ .-]*(?:front|f).*door|door[_ .-]*(?:fl|front[_ .-]*left|left[_ .-]*front))/i;
 const explicit: Mesh[] = [], left: Mesh[] = [];
 root.traverse(object => {
  if (!(object instanceof Mesh) || /rear|sticker|decal|latch|arm|frame/i.test(object.name)) return;
  if (frontLeft.test(object.name)) explicit.push(object);
  else if (rules["door-left"]!.test(object.name)) left.push(object);
 });
 const parts = explicit.length ? explicit : left;
 if (parts.length) return boundsInRoot(root, parts);
 const driverWindow = root.getObjectByName("WINDOW_FRONT_LEFT") ?? root.getObjectByName("WINDOW_LEFT");
 if (driverWindow instanceof Mesh) return boundsInRoot(root, [driverWindow]);
 // Some imports (including Sierra) pack the cab and doors into the body.
 // Use the cab glass and front lamp marker to locate its front seat.
 const glass = root.getObjectByName("GLASS_GEO");
 if (!glass) return null;
 const cab = boundsInRoot(root, [glass]);
 if (cab.isEmpty()) return null;
 const center = cab.getCenter(new Vector3());
 const lamp = root.getObjectByName("HEADLIGHT_L");
 const front = lamp ? root.worldToLocal(lamp.getWorldPosition(new Vector3())).z : cab.max.z;
 const point = new Vector3(cab.min.x, center.y, center.z + Math.sign(front - center.z) * .16 * (cab.max.z - cab.min.z));
 return new Box3(point, point.clone());
}

function moveUnderPivot(root:Object3D,objects:Mesh[],hinge:Vector3,part:VehicleStudioPart,axis:"x"|"y"|"z",open:number):VehiclePartHinge|null{
 if(!objects.length)return null;
 root.updateWorldMatrix(true,true);const world=new Map(objects.map(object=>[object,object.matrixWorld.clone()]));
 const pivot=new Group();pivot.name=`garage-pivot-${part}`;pivot.position.copy(hinge);root.add(pivot);root.updateWorldMatrix(true,true);
 const inverse=pivot.matrixWorld.clone().invert();
 for(const object of objects){object.parent?.remove(object);pivot.add(object);const local=new Matrix4().multiplyMatrices(inverse,world.get(object)!);local.decompose(object.position,object.quaternion,object.scale);object.updateMatrix();}
 return {part,pivot,axis,closed:0,open,angle:0};
}

/** Adds temporary presentation hinges only where the GLB has separate panel
 * meshes. This never changes or saves the source GLB or in-game vehicle. */
export function createVehiclePartRig(root:Group,model:string):VehiclePartHinge[]{
 root.updateWorldMatrix(true,true);const whole=new Box3().setFromObject(root,true),size=whole.getSize(new Vector3());
 const longAxis=size.x>=size.z?"x":"z",widthAxis=longAxis==="x"?"z":"x";
 const headlightMeshes:Mesh[]=[];root.traverse(object=>{if((object as Mesh).isMesh&&/head.?lights?/i.test(object.name))headlightMeshes.push(object as Mesh);});
 const front=headlightMeshes.length?boundsInRoot(root,headlightMeshes).getCenter(new Vector3())[longAxis]:whole.min[longAxis];
 const frontSign=front<whole.getCenter(new Vector3())[longAxis]?-1:1;
 const hinges:VehiclePartHinge[]=[];
 for(const part of ["door-left","door-right","hood","trunk","headlights"] as const){
  if(part==="headlights"&&model!=="ae86")continue;
  const objects=meshCandidates(root,part);if(!objects.length)continue;
  const bounds=boundsInRoot(root,objects),center=bounds.getCenter(new Vector3()),point=center.clone();let axis:"x"|"y"|"z"="y",angle=0;
  if(part==="door-left"||part==="door-right"){
   point[longAxis]=frontSign<0?bounds.min[longAxis]:bounds.max[longAxis];
   point.y=bounds.min.y+bounds.getSize(new Vector3()).y*.35;
   angle=(part==="door-left"?-1:1)*Math.PI/3;
  }else{
   axis=widthAxis;
   if(part==="hood"){point[longAxis]=frontSign<0?bounds.max[longAxis]:bounds.min[longAxis];angle=frontSign*Math.PI/5;}
   else if(part==="trunk"){point[longAxis]=frontSign<0?bounds.min[longAxis]:bounds.max[longAxis];angle=-frontSign*Math.PI/5;}
   else {point[longAxis]=frontSign<0?bounds.min[longAxis]:bounds.max[longAxis];angle=frontSign*Math.PI/4;}
  }
  const hinge=moveUnderPivot(root,objects,point,part,axis,angle);if(hinge)hinges.push(hinge);
 }
 return hinges;
}

export function advanceVehiclePartRig(hinges:VehiclePartHinge[],parts:Record<VehicleStudioPart,boolean>,delta:number){
 const blend=1-Math.exp(-Math.max(0,delta)*8);
 for(const hinge of hinges){const target=parts[hinge.part]?hinge.open:hinge.closed;hinge.angle+= (target-hinge.angle)*blend;hinge.pivot.rotation[hinge.axis]=hinge.angle;}
}

export function availableVehicleParts(hinges:VehiclePartHinge[]){return new Set(hinges.map(hinge=>hinge.part));}
