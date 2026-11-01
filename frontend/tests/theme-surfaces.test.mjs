import test from 'node:test';
import assert from 'node:assert/strict';
import {UI_THEMES} from '../src/theme/catalog.ts';
import {PAUSE_MENU_ITEMS} from '../src/game/menus/menuItems.ts';
import {applyShowroomPaint,prepareGarageVehiclePaint} from '../src/game/preview/garageVehiclePaint.ts';
import {sanitizeGarageEffects} from '../src/store/preferences/garageEffects.ts';
import {Group,Mesh,BoxGeometry,MeshStandardMaterial} from 'three';
const luminance=hex=>{
 const c=hex.slice(1).match(/../g).map(n=>parseInt(n,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);
 return c[0]*.2126+c[1]*.7152+c[2]*.0722;
};
test('every theme supports readable primary and secondary text on every shared surface',()=>{
 for(const [id,p] of Object.entries(UI_THEMES))for(const fg of ['text','muted'])for(const bg of ['background','panel','raised']) {
  const a=luminance(p[fg]),b=luminance(p[bg]);
  assert((Math.max(a,b)+.05)/(Math.min(a,b)+.05)>=4.5,`${id}: ${fg} on ${bg}`);
 }
});
test('world editor access is absent from pause while normal actions remain',()=>{
 assert(!PAUSE_MENU_ITEMS.some(i=>i.id==='world_builder'));
 assert(PAUSE_MENU_ITEMS.some(i=>i.id==='settings'));
 assert(PAUSE_MENU_ITEMS.some(i=>i.id==='resume'));
});
test('pink showroom paint restores calibrated factory color and never touches glass',()=>{
 const root=new Group(),geometry=new BoxGeometry();
 const paint=new MeshStandardMaterial({color:0xffffff});paint.name='Primary.002';
 const glass=new MeshStandardMaterial({color:0x556677,transparent:true});glass.name='Windows.002';
 root.add(new Mesh(geometry,[paint,glass]));
 prepareGarageVehiclePaint(root,'ae86');const factory=paint.color.clone(),windowColor=glass.color.clone();
 applyShowroomPaint(root,'ae86','hot-pink');assert(!paint.color.equals(factory));assert(glass.color.equals(windowColor));
 const hot=paint.color.clone();applyShowroomPaint(root,'ae86','pastel-pink');assert(!paint.color.equals(hot));
 applyShowroomPaint(root,'ae86','factory');assert(paint.color.equals(factory));
 assert.equal('paint' in sanitizeGarageEffects({paint:'hot-pink'}),false);
 assert.equal('paintSoftness' in sanitizeGarageEffects({paintSoftness:.9}),false);
 geometry.dispose();paint.dispose();glass.dispose();
});

test('bridge and canal prefabs round-trip through the existing layout document',async()=>{
 const {addPiece,emptyLayout,parseLayout}=await import('../src/worldBuilder/document/layoutDocument.ts');
 let doc=emptyLayout('road_jump_lab');
 doc=addPiece(doc,'bridge-span',[20,3,0]);doc=addPiece(doc,'canal-section',[20,0,0]);
 const restored=parseLayout(JSON.parse(JSON.stringify(doc)),'road_jump_lab');
 assert.equal(restored.objects.length,2);assert(restored.objects[0].parts.some(p=>p.solid!==false));
 assert(restored.objects[1].parts.some(p=>p.solid===false));
});
