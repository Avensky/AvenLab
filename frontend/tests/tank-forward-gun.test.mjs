import test from'node:test';import assert from'node:assert/strict';import fs from'node:fs';import{createServer}from'vite';import{BufferGeometry,Float32BufferAttribute,Group,Mesh,MeshStandardMaterial,Vector3,Quaternion}from'three';
const fixture=JSON.parse(fs.readFileSync(new URL('./fixtures/tank-forward-gun.json',import.meta.url)));
test('measured front-port gun pitches independently while original basket geometry and cached asset remain intact',async()=>{
 const vite=await createServer({server:{middlewareMode:true,hmr:false,ws:false},appType:'custom',logLevel:'error'});
 try{
  const {createTankForwardGun,TANK_FORWARD_GUN_BASE:base,TANK_FORWARD_GUN_MUZZLE:muzzle,TANK_TURRET_PIVOT:turretPivot}=await vite.ssrLoadModule('/src/vehicles/tools/tankForwardGun.ts');
  const scene=new Group(),turret=new Group();turret.position.fromArray(turretPivot);scene.add(turret);const originals=[],sources=[];
  for(const[name,data]of Object.entries(fixture.meshes)){const geometry=new BufferGeometry();geometry.setAttribute('position',new Float32BufferAttribute(data.position,3));geometry.setIndex(data.index);const mesh=new Mesh(geometry,new MeshStandardMaterial());mesh.name=name;scene.add(mesh);scene.updateMatrixWorld(true);turret.attach(mesh);originals.push({geometry,data});sources.push(mesh);}
  const gun=createTankForwardGun(scene,turret);assert.equal(gun.parts.length,2);assert.equal(gun.ownedGeometries.length,4);
  scene.updateMatrixWorld(true);assert(gun.muzzle.getWorldPosition(new Vector3()).distanceTo(new Vector3(...muzzle))<1e-6);
  const fixed=sources.map(source=>new Vector3().fromBufferAttribute(source.geometry.getAttribute('position'),0).applyMatrix4(source.matrixWorld));
  gun.pitch.rotation.x=-.20;scene.updateMatrixWorld(true);
  sources.forEach((source,i)=>assert(new Vector3().fromBufferAttribute(source.geometry.getAttribute('position'),0).applyMatrix4(source.matrixWorld).distanceTo(fixed[i])<1e-6,'unrelated basket/turret triangles never pitch with the gun'));
  turret.rotation.y=.7;scene.updateMatrixWorld(true);
  const yaw=new Quaternion().setFromAxisAngle(new Vector3(0,1,0),.7),pitch=new Quaternion().setFromAxisAngle(new Vector3(1,0,0),-.20);
  const expected=new Vector3(...base).sub(new Vector3(...turretPivot)).applyQuaternion(yaw).add(new Vector3(...turretPivot)).add(new Vector3(...muzzle).sub(new Vector3(...base)).applyQuaternion(pitch).applyQuaternion(yaw));
  assert(gun.muzzle.getWorldPosition(new Vector3()).distanceTo(expected)<1e-6,'front-end muzzle exactly matches server yaw/pitch geometry');
  let disposed=0,cachedDisposed=0;gun.ownedGeometries.forEach(geometry=>geometry.addEventListener('dispose',()=>disposed++));originals.forEach(({geometry,data})=>{assert.equal(geometry.getAttribute('position').count,data.position.length/3);assert.equal(geometry.index.count,data.index.length);geometry.addEventListener('dispose',()=>cachedDisposed++);});
  gun.ownedGeometries.forEach(geometry=>geometry.dispose());assert.equal(disposed,4);assert.equal(cachedDisposed,0,'unmount cleanup owns derived slices, never cached GLTF buffers');
  sources.forEach(mesh=>mesh.material.dispose());originals.forEach(({geometry})=>geometry.dispose());
 }finally{await vite.close();}
});
