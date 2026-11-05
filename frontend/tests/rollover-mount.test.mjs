import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import {createServer} from 'vite';
import {Quaternion, Vector3} from 'three';
import {cameraGround} from '../src/utils/cameraGround.ts';

test('BRZ/FR-S wheel travels on the chassis strut between reversing rollover packets',async()=>{
  const vite=await createServer({server:{middlewareMode:true,hmr:false,ws:false},appType:'custom',logLevel:'error'});
  try {
    const {PhysicsInterpolationBuffer}=await vite.ssrLoadModule('/src/hooks/usePhysicsInterpolator.ts');
    const buffer=new PhysicsInterpolationBuffer();
    const axis=new Vector3(1,0,0), corner=new Vector3(.83,-.53,1.26), steer=new Quaternion().setFromAxisAngle(new Vector3(0,1,0),.25);
    for(const [tick,angle,height] of [[0,0,1],[1,-Math.PI,1.5]]){
      const rotation=new Quaternion().setFromAxisAngle(axis,angle);
      const position=new Vector3(-40, height, 45+tick);
      const wheelPosition=corner.clone().applyQuaternion(rotation).add(position);
      buffer.setSnapshot('driver',{id:'driver',vehicle_id:'frs',position:position.toArray(),rotation:rotation.toArray(),
        wheels:[{id:'fl',position:wheelPosition.toArray(),rotation:rotation.clone().multiply(steer).toArray()}]},
        {tick:tick+1,received_at_ms:1000+tick*1000/60});
    }
    for(let i=1;i<10;i++){
      const pose=buffer.getInterpolated('driver',0,1000+i*100/60);
      const inverse=new Quaternion().fromArray(pose.rotation).invert(), wheel=pose.wheels[0];
      const local=new Vector3().fromArray(wheel.position).sub(new Vector3().fromArray(pose.position)).applyQuaternion(inverse);
      assert(local.distanceTo(corner)<1e-6);
      assert(inverse.multiply(new Quaternion().fromArray(wheel.rotation)).angleTo(steer)<1e-6);
    }
  } finally {await vite.close();}
});

test('driving camera clears banks, open water, and the seabed beyond the shoreline',()=>{
  const map=JSON.parse(fs.readFileSync(new URL('../../avenlab-server/src/assets/blocks/harbor_canal_fleet_colliders.json',import.meta.url)));
  assert.equal(cameraGround(map,100,50),.35);
  assert(Math.abs(cameraGround(map,0,65)-(-7.6))<.001);
  assert.equal(cameraGround(map,16000,450),-59.65);
  const inland=JSON.parse(fs.readFileSync(new URL('../../avenlab-server/src/assets/blocks/road_precision_colliders.json',import.meta.url)));
  assert.equal(cameraGround(inland,0,0), inland.surface.road_y+.35);
});

test('mounted Browning sample separates its roof stand and aiming gun and matches the server muzzle',()=>{
  const bytes=fs.readFileSync(new URL('../public/models/world/m2-browning.glb',import.meta.url));
  const doc=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)));
  const bounds=name=>{
    const node=doc.nodes.find(n=>n.name===name);
    return doc.accessors[doc.meshes[node.mesh].primitives[0].attributes.POSITION];
  };
  assert(bytes.length < 150000);
  assert(Math.abs(bounds('Tripod').min[1])<.002);
  assert(Math.abs(bounds('M2').min[2]+.7596)<.002);
});

test('selecting the M2 in the cockpit saves it per vehicle and leaves the tank cannon primary',async()=>{
  const {JSDOM}=await import('jsdom');
  const {act,createElement}=await import('react');
  const {createRoot}=await import('react-dom/client');
  const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost/',pretendToBeVisual:true});
  const old=new Map();
  for(const [key,value] of Object.entries({window:dom.window,document:dom.window.document,localStorage:dom.window.localStorage,
    HTMLElement:dom.window.HTMLElement,IS_REACT_ACT_ENVIRONMENT:true})){
    old.set(key,Object.getOwnPropertyDescriptor(globalThis,key));
    Object.defineProperty(globalThis,key,{value,writable:true,configurable:true});
  }
  const vite=await createServer({server:{middlewareMode:true,hmr:false,ws:false},appType:'custom',logLevel:'error'});
  const root=createRoot(document.querySelector('#root'));
  try {
    const {MountPicker}=await vite.ssrLoadModule('/src/combat/MountPicker.tsx');
    const {useCombatStore}=await vite.ssrLoadModule('/src/combat/combatStore.ts');
    const render=vehicle=>act(async()=>root.render(createElement(MountPicker,{vehicle})));
    const pick=text=>[...document.querySelectorAll('button')].find(b=>b.textContent.includes(text));
    await render('brz');await act(async()=>pick('M2 Browning').click());
    assert.equal(pick('M2 Browning').getAttribute('aria-pressed'),'true');
    assert.equal(useCombatStore.getState().mounts.brz.role,'support');
    await render('camaro');assert.equal(pick('Factory guns').getAttribute('aria-pressed'),'true');
    await render('tank');await act(async()=>pick('Forward coaxial').click());
    assert.equal(useCombatStore.getState().secondaryWeapon,'forward-mg');
    assert.match(document.body.textContent,/Factory cannon/);
    await render('brz');assert.equal(pick('M2 Browning').getAttribute('aria-pressed'),'true');
  }finally{
    await act(async()=>root.unmount());await vite.close();dom.window.close();
    for(const [key,value] of old)if(value)Object.defineProperty(globalThis,key,value);else delete globalThis[key];
  }
});

test('each shipping FR-S rim spins around its own cambered brake disc',async()=>{
  const {NodeIO}=await import('@gltf-transform/core');
  const {ALL_EXTENSIONS}=await import('@gltf-transform/extensions');
  const {default:draco}=await import('draco3dgltf');
  const {BufferAttribute,BufferGeometry,Mesh}=await import('three');
  const {brzWheelAxle}=await import('../src/vehicles/tools/brzWheelAxle.ts');
  const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'draco3d.decoder':await draco.createDecoderModule()});
  const doc=await io.read(new URL('../public/models/vehicles/brz.glb',import.meta.url).pathname);
  const nodes=doc.getRoot().listNodes().filter(n=>/^WHEEL_(FL|FR|RL|RR)$/.test(n.getName()));
  assert.equal(nodes.length,4);
  for(const node of nodes) {
    const primitive=node.getMesh().listPrimitives().find(p=>/_EXT_Disc$/i.test(p.getMaterial().getName()));
    const geometry=new BufferGeometry().setAttribute('position',new BufferAttribute(primitive.getAttribute('POSITION').getArray(),3));
    geometry.setIndex(new BufferAttribute(primitive.getIndices().getArray(),1));
    const rotor=new Mesh(geometry);
    rotor.matrixAutoUpdate=false;rotor.matrix.fromArray(node.getWorldMatrix());
    const axle=brzWheelAxle(rotor);
    assert(axle.x>.999 && Math.abs(axle.y)>.021 && Math.abs(axle.y)<.026,node.getName());
    assert.equal(Math.sign(axle.y),node.getName().endsWith('L')?1:-1);
    const spin=new Quaternion().setFromAxisAngle(axle,Math.PI*.75);
    assert(axle.clone().applyQuaternion(spin).distanceTo(axle)<1e-6);
    geometry.dispose();rotor.material.dispose();
  }
});
