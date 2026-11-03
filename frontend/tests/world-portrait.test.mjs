import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {createServer} from 'vite';
test('world portraits use actual installed geometry, the shared legacy transform, and bounded inputs',async()=>{
 const vite=await createServer({server:{middlewareMode:true,hmr:false,ws:false},appType:'custom',logLevel:'error'});
 try{const {worldPreviewShapes}=await vite.ssrLoadModule('/src/game/preview/worldPreviewGeometry.ts');const {parseMapDocument,editableBoxes}=await vite.ssrLoadModule('/src/worldBuilder/document/mapDocument.ts');
 for(const name of ['streaming_endless_city','road_jump_lab','coastal_district']){const doc=JSON.parse(fs.readFileSync(`public/world-builder/${name}_colliders.json`));const shapes=worldPreviewShapes(doc);assert(shapes.length>0);assert(shapes.length<=1500);assert(shapes.every(s=>[s.x,s.y,s.z,s.w,s.h,s.d,s.yaw].every(Number.isFinite)));if(!doc.authored_layout){const box=editableBoxes(parseMapDocument(doc))[0];assert.deepEqual([shapes[0].x,shapes[0].y,shapes[0].z],box.center);assert.deepEqual([shapes[0].w,shapes[0].h,shapes[0].d],box.half.map(n=>n*2));}}
 assert.deepEqual(worldPreviewShapes(null),[]);assert.deepEqual(worldPreviewShapes({authored_layout:{objects:[{position:[NaN,0,0],size:[1,1,1]}]}}),[]);
 }finally{await vite.close();}
});
