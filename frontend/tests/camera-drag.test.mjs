import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {createServer} from 'vite';

test('bare-canvas camera drag supports primary mouse/trackpad without taking turret or HUD input',async t=>{
 const dom=new JSDOM('<canvas></canvas><button id="aim">Turret aim</button>',{pretendToBeVisual:true});
 const document=dom.window.document,canvas=document.querySelector('canvas'),hud=document.querySelector('button');
 let visible='visible';Object.defineProperty(document,'visibilityState',{get:()=>visible,configurable:true});
 const captured=new Set();canvas.setPointerCapture=id=>captured.add(id);canvas.hasPointerCapture=id=>captured.has(id);canvas.releasePointerCapture=id=>captured.delete(id);
 const server=await createServer({server:{middlewareMode:true,hmr:false,ws:false},appType:'custom',logLevel:'error',optimizeDeps:{noDiscovery:true,include:[]}});
 let stop;
 const pointer=(target,type,{id=1,x=100,y=100,button=0,buttons=1,pointerType='mouse',prevented=false}={})=>{
  const event=new dom.window.MouseEvent(type,{bubbles:true,cancelable:true,clientX:x,clientY:y,button,buttons});
  Object.defineProperties(event,{pointerId:{value:id},pointerType:{value:pointerType}});if(prevented)event.preventDefault();target.dispatchEvent(event);return event;
 };
 try{
  const {bindCameraDrag,canUseDrivingCamera}=await server.ssrLoadModule('/src/utils/cameraDrag.ts');
  let ui={screen:'sandbox',overlay:null,isModeLoading:false},scope=false,enabled=true;
  const deltas=[],active=[];
  const bind=()=>bindCameraDrag(canvas,{canDrag:()=>enabled&&canUseDrivingCamera(ui,scope),onDelta:(x,y)=>deltas.push([x,y]),onActiveChange:value=>active.push(value)});
  stop=bind();
  await t.test('primary click/trackpad drag and right drag both move the view; hover/middle do not',()=>{
   pointer(canvas,'pointermove',{x:120});assert.equal(deltas.length,0);
   pointer(canvas,'pointerdown',{button:1,buttons:4});pointer(canvas,'pointermove',{x:140,buttons:4});assert.equal(deltas.length,0);
   pointer(canvas,'pointerdown');assert(captured.has(1));pointer(canvas,'pointermove',{x:125,y:90});assert.deepEqual(deltas.at(-1),[25,-10]);pointer(canvas,'pointerup',{buttons:0});assert(!captured.has(1));
   pointer(canvas,'pointerdown',{button:2,buttons:2,x:400,y:200});pointer(canvas,'pointermove',{buttons:2,x:410,y:203});assert.deepEqual(deltas.at(-1),[10,3]);pointer(canvas,'pointerup',{button:2,buttons:0});
  });
  await t.test('HUD gestures and consumed canvas events never start camera look',()=>{
   const before=deltas.length,states=active.length;
   pointer(hud,'pointerdown');pointer(hud,'pointermove',{x:300});pointer(hud,'pointerup',{buttons:0});assert.equal(active.length,states);assert.equal(deltas.length,before);
   pointer(canvas,'pointerdown',{prevented:true});pointer(canvas,'pointermove',{x:300});assert.equal(active.length,states);assert.equal(deltas.length,before);
  });
  await t.test('a single touch owns the camera while unrelated touch and release leave it alone',()=>{
   pointer(canvas,'pointerdown',{id:7,pointerType:'touch',x:50,y:50});
   pointer(canvas,'pointerdown',{id:8,pointerType:'touch',x:900,y:900});pointer(canvas,'pointermove',{id:8,pointerType:'touch',x:950,y:920});pointer(hud,'pointerup',{id:8,pointerType:'touch',buttons:0});assert(captured.has(7));
   pointer(canvas,'pointermove',{id:7,pointerType:'touch',x:55,y:53});assert.deepEqual(deltas.at(-1),[5,3]);pointer(dom.window,'pointerup',{id:7,pointerType:'touch',buttons:0});assert(!captured.has(7));
   pointer(canvas,'pointerdown',{id:9,pointerType:'touch',x:1000,y:800});pointer(canvas,'pointermove',{id:9,pointerType:'touch',x:1001,y:802});assert.deepEqual(deltas.at(-1),[1,2],'a new pointer starts from its own coordinates');pointer(canvas,'pointercancel',{id:9,pointerType:'touch'});
  });
  await t.test('menu, loading, scope and disabled transitions stop an in-progress drag immediately',()=>{
   const blocked=[()=>{ui={...ui,overlay:'pause'};},()=>{ui={...ui,isModeLoading:true};},()=>{scope=true;},()=>{enabled=false;}];
   for(const block of blocked){
    ui={screen:'sandbox',overlay:null,isModeLoading:false};scope=false;enabled=true;
    pointer(canvas,'pointerdown');const before=deltas.length;block();pointer(canvas,'pointermove',{x:500});assert.equal(deltas.length,before);assert.equal(active.at(-1),false);assert(!captured.has(1));
   }
   assert.equal(canUseDrivingCamera({screen:'heroes',overlay:null,isModeLoading:false},false),false);
   assert.equal(canUseDrivingCamera({screen:'sandbox',overlay:'vehicle_select',isModeLoading:false},false),true,'immersive in-world preview retains camera drag');
   assert.equal(canUseDrivingCamera({screen:'sandbox',overlay:'cockpit',isModeLoading:false},false),false);
   ui={screen:'sandbox',overlay:null,isModeLoading:false};scope=false;enabled=true;
  });
  await t.test('blur, hidden tab, missed mouse-up, lost capture and unmount release the pointer',()=>{
   pointer(canvas,'pointerdown');dom.window.dispatchEvent(new dom.window.Event('blur'));assert(!captured.has(1));
   pointer(canvas,'pointerdown');visible='hidden';document.dispatchEvent(new dom.window.Event('visibilitychange'));assert(!captured.has(1));visible='visible';
   pointer(canvas,'pointerdown');pointer(canvas,'pointermove',{x:300,buttons:0});assert(!captured.has(1));
   pointer(canvas,'pointerdown');captured.delete(1);pointer(canvas,'lostpointercapture');assert.equal(active.at(-1),false);
   pointer(canvas,'pointerdown');stop();stop=null;assert(!captured.has(1));const before=deltas.length;pointer(canvas,'pointerdown');pointer(canvas,'pointermove',{x:800});assert.equal(deltas.length,before);
  });
 }finally{stop?.();await server.close();dom.window.close();}
});
