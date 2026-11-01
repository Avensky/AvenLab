import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'vite';

test('world editor uses the selected shared environment and retains independent drafts',async()=>{
 const server=await createServer({server:{middlewareMode:true},appType:'custom'});
 try {
  globalThis.localStorage={getItem:()=>null,setItem:()=>{}};
  globalThis.window={dispatchEvent:()=>true};
  const {useUIStore:ui}=await server.ssrLoadModule('/src/store/menus/uiStore.ts');
  const {mapCatalog,useSelectionStore:selection}=await server.ssrLoadModule('/src/store/selection/selectionStore.ts');
  const {useBuilderStore:builder}=await server.ssrLoadModule('/src/worldBuilder/state/builderStore.ts');
  const actions=await server.ssrLoadModule('/src/worldBuilder/state/builderActions.ts');
  const fs=await import('node:fs');
  const docs=mapCatalog.map(m=>JSON.parse(fs.readFileSync(new URL(`../../avenlab-server/src/assets/blocks/${m.id}_colliders.json`,import.meta.url),'utf8')));
  actions.configureBuilderMapSources(docs);
  ui.setState({screen:'world_builder',overlay:null});
  await actions.loadStandaloneBuilder();
  assert.equal(builder.getState().doc.map_id,mapCatalog[0].id);
  selection.setState({mapIndex:mapCatalog.findIndex(m=>m.id==='road_jump_lab')});
  await actions.loadStandaloneBuilder();
  assert.equal(builder.getState().doc.map_id,'road_jump_lab');
  assert.equal(selection.getState().getSelectedMap().id,'road_jump_lab');
  await actions.switchBuilderWorld('workshop_yard');
  assert.equal(selection.getState().getSelectedMap().id,'workshop_yard');
 } finally {await server.close();delete globalThis.localStorage;delete globalThis.window;}
});

test('vehicle presets are per vehicle and physics payload excludes unsupported fields',async()=>{
 const server=await createServer({server:{middlewareMode:true},appType:'custom'});
 try {
  globalThis.localStorage={getItem:()=>null,setItem:()=>{}};
  const {tuningOnly}=await server.ssrLoadModule('/src/worldBuilder/vehicleEditor/tuningFields.ts');
  const {useVehicleEditorStore:editor}=await server.ssrLoadModule('/src/worldBuilder/vehicleEditor/vehicleEditorStore.ts');
  assert.deepEqual(tuningOnly({mass:1300,max_speed:40,resources:{},wheels:4}),{mass:1300,max_speed:40});
  const camera={x:-.3,y:.5,z:.2,yaw:0,pitch:0,fov:75,duration:3};
  editor.getState().setCamera('ae86',camera);
  editor.getState().save('ae86',{mass:1300});
  editor.getState().save('brz',{mass:1500});
  assert.equal(editor.getState().presets.ae86.tuning.mass,1300);
  assert.equal(editor.getState().presets.brz.tuning.mass,1500);
  assert.equal(editor.getState().presets.ae86.camera.fov,75);
 } finally {await server.close();delete globalThis.localStorage;}
});
