import * as T from 'three';
import {OrbitControls} from 'three/examples/jsm/controls/OrbitControls.js';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {DRACOLoader} from 'three/examples/jsm/loaders/DRACOLoader.js';
import bundle from 'virtual:road-kit-bundle';
import {prepareRoadTemplate,partEnabled,variantBounds,type RoadId,type RoadTemplate,type RawPart,type Variant,type RoadPart} from './roadKitCore';
import {frameCorners,magneticSnap,type Pose,type SnapLock} from './roadKitSnap';
export type StageState={asset:RoadId;mode:'inspect'|'join'|'block';view:'top'|'iso';focus:'all'|'bottom';a:Variant;b:Variant;pose:Pose;collisions:boolean;guides:boolean;basis:'asphalt'|'outer';snap:boolean;radius:number};
type Template={data:RoadTemplate;geometry:Map<string,T.BufferGeometry>;material:Map<string,T.Material>};
const bytes=(base64:string)=>Uint8Array.from(atob(base64),c=>c.charCodeAt(0));
export class RoadKitStage{
 private renderer:T.WebGLRenderer;private scene=new T.Scene();private camera:T.OrthographicCamera;private controls:OrbitControls;private observer:ResizeObserver;
 private loader:GLTFLoader;private decoder:DRACOLoader;private urls:string[]=[];private cache=new Map<RoadId,Promise<Template>>();private sequence=0;private current:Template|null=null;
 private fixed=new T.Group();private moving=new T.Group();private state:StageState|null=null;private raf=0;private disposed=false;
 private target=new T.Vector3();private dragging:{id:number;offset:T.Vector2;original:Pose;lock:SnapLock|null}|null=null;
 private ray=new T.Raycaster();private ground=new T.Plane(new T.Vector3(0,1,0),0);private last=performance.now();private span=100;
 private container:HTMLElement;private loaded:(t:RoadTemplate)=>void;private committed:(p:Pose)=>void;private notice:(text:string)=>void;
 constructor(container:HTMLElement,loaded:(t:RoadTemplate)=>void,committed:(p:Pose)=>void,notice:(text:string)=>void){
  this.container=container;this.loaded=loaded;this.committed=committed;this.notice=notice;
  this.renderer=new T.WebGLRenderer({antialias:true,alpha:false});this.renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));this.renderer.setClearColor('#1b2b25');container.append(this.renderer.domElement);
  this.camera=new T.OrthographicCamera(-50,50,50,-50,.1,4000);this.camera.up.set(0,0,-1);this.controls=new OrbitControls(this.camera,this.renderer.domElement);this.controls.enableDamping=true;
  this.scene.add(new T.HemisphereLight('#f3f5e6','#384438',2));const sun=new T.DirectionalLight('#fff3dc',2);sun.position.set(-100,160,90);this.scene.add(sun);
  const grid=new T.GridHelper(1500,150,'#4d6852','#334a3a');grid.position.y=-.03;this.scene.add(grid,this.fixed,this.moving);
  const manager=new T.LoadingManager(),wrapper=URL.createObjectURL(new Blob([bytes(bundle.decoder.wrapper)],{type:'text/javascript'})),wasm=URL.createObjectURL(new Blob([bytes(bundle.decoder.wasm)],{type:'application/wasm'}));this.urls.push(wrapper,wasm);
  manager.setURLModifier(url=>url.endsWith('draco_wasm_wrapper.js')?wrapper:url.endsWith('draco_decoder.wasm')?wasm:url);
  this.decoder=new DRACOLoader(manager).setDecoderPath('inline-draco/').setDecoderConfig({type:'wasm'}).setWorkerLimit(1);this.loader=new GLTFLoader(manager).setDRACOLoader(this.decoder);
  this.observer=new ResizeObserver(()=>this.resize());this.observer.observe(container);this.resize();
  const canvas=this.renderer.domElement;canvas.addEventListener('pointerdown',this.down,true);canvas.addEventListener('pointermove',this.move,true);canvas.addEventListener('pointerup',this.up,true);canvas.addEventListener('pointercancel',this.cancel);canvas.addEventListener('lostpointercapture',this.cancel);window.addEventListener('blur',this.cancel);window.addEventListener('keydown',this.escape,true);
  this.raf=requestAnimationFrame(this.animate);
 }
 private async load(id:RoadId):Promise<Template>{
  const existing=this.cache.get(id);if(existing)return existing;
  const pending=(async()=>{
   const gltf=await this.loader.parseAsync(bytes(bundle.assets[id].base64).buffer,'');gltf.scene.updateMatrixWorld(true);
   const raw:RawPart[]=[],geometry=new Map<string,T.BufferGeometry>(),material=new Map<string,T.Material>();
   for(const root of gltf.scene.children)root.traverse(object=>{
    if(!(object instanceof T.Mesh))return;const mat=Array.isArray(object.material)?object.material[0]:object.material;
    const g=object.geometry.clone().applyMatrix4(object.matrixWorld),p=g.getAttribute('position'),positions=[];
    for(let i=0;i<p.count;i++)positions.push(p.getX(i),p.getY(i),p.getZ(i));
    const key=`${root.name}:${mat.name}:${raw.length}`;raw.push({id:key,sourceNode:root.name,material:mat.name,positions,indices:g.index?Array.from(g.index.array):Array.from({length:p.count},(_,i)=>i)});geometry.set(key,g);
    const m=mat.clone();if(m instanceof T.MeshStandardMaterial){m.roughness=.95;m.metalness=0;}if(m instanceof T.MeshPhysicalMaterial){m.clearcoat=0;m.transmission=0;}
    if(mat.name==='MarkingRoad'){m.polygonOffset=true;m.polygonOffsetFactor=-1;m.polygonOffsetUnits=-1;}material.set(key,m);
   });
   const data=prepareRoadTemplate(id,raw),normalization=new T.Matrix4().makeRotationY(data.sourceYaw).multiply(new T.Matrix4().makeTranslation(-data.origin[0],-data.origin[1],-data.origin[2]));
   // Normals and UVs remain attached to the original mesh; only its transform is baked.
   for(const g of geometry.values())g.applyMatrix4(normalization);
   return{data,geometry,material};
  })();this.cache.set(id,pending);return pending;
 }
 async update(state:StageState){
  const before=this.state;this.state=state;
  if(!this.current||this.current.data.id!==state.asset){
   const token=++this.sequence;this.notice('Loading your original GLB…');
   try{const template=await this.load(state.asset);if(this.disposed||token!==this.sequence)return;this.current=template;this.loaded(template.data);this.rebuild();this.fit();this.notice('Source loaded. Sidewalk groups contain curb and paving.');}catch(e){if(token===this.sequence)this.notice(e instanceof Error?e.message:'Could not load GLB');}return;
  }
  this.rebuild();if(!before||before.asset!==state.asset||before.mode!==state.mode||before.view!==state.view||before.focus!==state.focus)this.fit();
 }
 private clear(group:T.Group){group.traverse(o=>{if(o instanceof T.Mesh||o instanceof T.LineSegments){if(o.userData.temporaryGeometry)o.geometry.dispose();if(o.userData.temporaryMaterial)(o.material as T.Material).dispose();}});group.clear();}
 private build(group:T.Group,variant:Variant,owner:string){
  if(!this.current||!this.state)return;const {data,geometry,material}=this.current;
  for(const p of data.parts){if(!partEnabled(p,variant))continue;if(this.state.collisions&&(p.role==='markings'||p.role==='details'))continue;
   const mat=this.state.collisions?new T.MeshBasicMaterial({color:p.role==='surface'?'#6ab8c4':'#c4dc9f',transparent:true,opacity:.35,side:T.DoubleSide,depthWrite:false}):material.get(p.id)!;
   const mesh=new T.Mesh(geometry.get(p.id),mat);mesh.userData.owner=owner;mesh.userData.role=p.role;mesh.userData.temporaryMaterial=this.state.collisions;group.add(mesh);
   if(this.state.collisions){const wire=new T.LineSegments(new T.WireframeGeometry(geometry.get(p.id)!),new T.LineBasicMaterial({color:p.role==='surface'?'#82ccd3':'#d5e7bc',transparent:true,opacity:.7}));wire.userData.temporaryGeometry=true;wire.userData.temporaryMaterial=true;wire.raycast=()=>{};group.add(wire);}
  }
  if(this.state.guides)this.addFrame(group,variant,owner==='A'?'#8acbd0':'#eac18a');
 }
 private addFrame(group:T.Group,variant:Variant,color:string){
  if(!this.current||!this.state)return;const bounds=variantBounds(this.current.data,variant,this.state.basis),corners=frameCorners(bounds,{x:0,z:0,yaw:0});
  const coords=corners.flatMap((p,i)=>[p[0],.27,p[1],corners[(i+1)%4][0],.27,corners[(i+1)%4][1]]),geometry=new T.BufferGeometry().setAttribute('position',new T.Float32BufferAttribute(coords,3));
  const line=new T.LineSegments(geometry,new T.LineBasicMaterial({color,depthTest:false}));line.userData.temporaryGeometry=true;line.userData.temporaryMaterial=true;line.raycast=()=>{};group.add(line);
  const names=['NW','NE','SE','SW'];for(let i=0;i<corners.length;i++){const dot=new T.Mesh(new T.SphereGeometry(.45,8,6),new T.MeshBasicMaterial({color,depthTest:false}));dot.position.set(corners[i][0],.3,corners[i][1]);dot.name=names[i];dot.userData.temporaryGeometry=true;dot.userData.temporaryMaterial=true;dot.raycast=()=>{};group.add(dot);}
 }
 private rebuild(){
  if(!this.current||!this.state)return;this.cancel();this.clear(this.fixed);this.clear(this.moving);
  this.build(this.fixed,this.state.a,'A');this.moving.visible=this.state.mode==='join';if(this.moving.visible)this.build(this.moving,this.state.b,'B');
  this.moving.rotation.y=this.state.pose.yaw;this.target.set(this.state.pose.x,0,this.state.pose.z);this.moving.position.copy(this.target);
 }
 fit(){
  if(!this.current||!this.state)return;const poses=[{variant:this.state.a,pose:{x:0,z:0,yaw:0}}];if(this.state.mode==='join')poses.push({variant:this.state.b,pose:this.state.pose});
  const points=poses.flatMap(o=>frameCorners(variantBounds(this.current!.data,o.variant),o.pose));const xs=points.map(p=>p[0]),zs=points.map(p=>p[1]);const cx=(Math.min(...xs)+Math.max(...xs))/2,cz=this.state.focus==='bottom'?Math.max(...zs)-28:(Math.min(...zs)+Math.max(...zs))/2;
  const aspect=Math.max(.1,this.container.clientWidth/Math.max(1,this.container.clientHeight));this.span=this.state.focus==='bottom'?Math.max(65,(Math.max(...xs)-Math.min(...xs))*1.2/aspect):Math.max((Math.max(...xs)-Math.min(...xs))/aspect,Math.max(...zs)-Math.min(...zs))*1.15;
  this.camera.left=-this.span*aspect/2;this.camera.right=this.span*aspect/2;this.camera.top=this.span/2;this.camera.bottom=-this.span/2;this.camera.zoom=1;
  if(this.state.view==='top'){this.camera.up.set(0,0,-1);this.camera.position.set(cx,600,cz);this.controls.enableRotate=false;}else{this.camera.up.set(0,1,0);this.camera.position.set(cx+this.span*.7,this.span*.9,cz+this.span*.8);this.controls.enableRotate=true;}
  this.controls.target.set(cx,0,cz);this.camera.lookAt(this.controls.target);this.camera.updateProjectionMatrix();this.controls.update();
 }
 private resize(){const w=Math.max(1,this.container.clientWidth),h=Math.max(1,this.container.clientHeight);this.renderer.setSize(w,h);if(this.current)this.fit();}
 private planePoint=(event:PointerEvent)=>{const r=this.renderer.domElement.getBoundingClientRect();this.ray.setFromCamera(new T.Vector2((event.clientX-r.left)/r.width*2-1,-(event.clientY-r.top)/r.height*2+1),this.camera);return this.ray.ray.intersectPlane(this.ground,new T.Vector3());};
 private down=(e:PointerEvent)=>{
  if(e.button!==0||this.state?.mode!=='join'||this.dragging)return;const p=this.planePoint(e);if(!p)return;
  const hit=this.ray.intersectObject(this.moving,true).find(h=>h.object.userData.owner==='B');if(!hit)return;
  e.preventDefault();e.stopImmediatePropagation();this.controls.enabled=false;this.dragging={id:e.pointerId,offset:new T.Vector2(p.x-this.target.x,p.z-this.target.z),original:{x:this.target.x,z:this.target.z,yaw:this.moving.rotation.y},lock:null};this.renderer.domElement.setPointerCapture(e.pointerId);
 };
 private move=(e:PointerEvent)=>{
  const held=this.dragging,s=this.state;if(!held||e.pointerId!==held.id||!s||!this.current)return;const p=this.planePoint(e);if(!p)return;
  e.preventDefault();e.stopImmediatePropagation();const desired={x:p.x-held.offset.x,z:p.z-held.offset.y,yaw:s.pose.yaw};
  const result=s.snap?magneticSnap(variantBounds(this.current.data,s.b,s.basis),variantBounds(this.current.data,s.a,s.basis),desired,{x:0,z:0,yaw:0},s.radius,held.lock):{pose:desired,lock:null,distance:0};
  held.lock=result.lock;this.target.set(result.pose.x,0,result.pose.z);this.notice(result.lock?`${result.lock.kind==='corner'?'Corner':'Edge'} locked · ${result.distance.toFixed(3)} m attraction`:'Free placement · move a matching edge or corner closer');
 };
 private up=(e:PointerEvent)=>{if(this.dragging?.id!==e.pointerId)return;e.preventDefault();e.stopImmediatePropagation();this.dragging=null;this.controls.enabled=true;this.moving.position.copy(this.target);this.committed({x:this.target.x,z:this.target.z,yaw:this.moving.rotation.y});if(this.renderer.domElement.hasPointerCapture(e.pointerId))this.renderer.domElement.releasePointerCapture(e.pointerId);};
 private cancel=()=>{if(!this.dragging)return;const original=this.dragging.original;this.dragging=null;this.controls.enabled=true;this.target.set(original.x,0,original.z);this.moving.position.copy(this.target);this.notice('Unfinished drag cancelled.');};
 private escape=(e:KeyboardEvent)=>{if(e.code==='Escape'&&this.dragging){e.preventDefault();e.stopImmediatePropagation();this.cancel();}};
 private animate=(time:number)=>{if(this.disposed)return;const dt=Math.min(.1,(time-this.last)/1000);this.last=time;this.moving.position.lerp(this.target,1-Math.exp(-20*dt));this.controls.update();if(this.state?.mode!=='block')this.renderer.render(this.scene,this.camera);this.raf=requestAnimationFrame(this.animate);};
 dispose(){this.disposed=true;++this.sequence;cancelAnimationFrame(this.raf);this.observer.disconnect();this.controls.dispose();this.decoder.dispose();window.removeEventListener('blur',this.cancel);window.removeEventListener('keydown',this.escape,true);this.clear(this.fixed);this.clear(this.moving);this.renderer.dispose();this.renderer.domElement.remove();this.urls.forEach(URL.revokeObjectURL);}
 get template(){return this.current?.data??null;}
 get visibleRoles(){return this.fixed.children.filter(o=>o.userData.role).map(o=>o.userData.role as RoadPart['role']);}
}
