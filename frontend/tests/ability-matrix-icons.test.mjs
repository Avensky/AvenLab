import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {createServer} from 'vite';
import {act,createElement as h} from 'react';
import {createRoot} from 'react-dom/client';

test('tank matrix has distinct mount choices and a fire burst in the bottom-right slot',async()=>{
 const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost/',pretendToBeVisual:true}),old=new Map();let vite,root;
 for(const [key,value]of Object.entries({window:dom.window,document:dom.window.document,navigator:dom.window.navigator,HTMLElement:dom.window.HTMLElement,Event:dom.window.Event,CustomEvent:dom.window.CustomEvent,localStorage:dom.window.localStorage,requestAnimationFrame:dom.window.requestAnimationFrame.bind(dom.window),cancelAnimationFrame:dom.window.cancelAnimationFrame.bind(dom.window),IS_REACT_ACT_ENVIRONMENT:true})){
  old.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{value,writable:true,configurable:true});
 }
 document.hasFocus=()=>true;Object.defineProperty(document,'visibilityState',{value:'visible',configurable:true});
 try{
  vite=await createServer({server:{middlewareMode:true,hmr:false,ws:false},appType:'custom',logLevel:'error'});const load=p=>vite.ssrLoadModule('/src/'+p);
  const {useCombatStore:combat,tankFireInputs:inputs}=await load('combat/combatStore.ts'),{useNetworkStore:network}=await load('store/session/networkStore.ts'),{useUIStore:ui}=await load('store/menus/uiStore.ts');
  network.setState({connected:true,playerId:'tank',snapshot:{entities:[{id:'tank',vehicle_id:'tank',health:{defeated:false},combat:{enabled:true,weapon:'cannon',cannon_reload:0,coax_reload:0,basket_reload:0}}]}});
  ui.setState({screen:'sandbox',overlay:null,isModeLoading:false});combat.getState().setEnabled(true);combat.getState().selectSecondary('roof-mg');
  const {VehicleAbilityActions}=await load('combat/VehicleAbilityActions.tsx');root=createRoot(document.getElementById('root'));await act(async()=>root.render(h(VehicleAbilityActions)));
  const roof=document.querySelector('.turret-orbit-roof button'),forward=document.querySelector('.turret-orbit-forward button');
  assert.equal(document.querySelector('.turret-actions').children.length,6);
  assert.notEqual(roof.querySelector('svg path').getAttribute('d'),forward.querySelector('svg path').getAttribute('d'));
  assert.equal(roof.getAttribute('aria-pressed'),'true');assert.equal(forward.getAttribute('aria-pressed'),'false');
  assert.equal(document.querySelector('.turret-orbit-secondary svg path').getAttribute('d'),'m12 2 2 6 6-2-3 6 5 3-6 1-1 6-4-5-6 3 2-6-5-3 7-1z');
  await act(async()=>forward.click());assert.equal(combat.getState().secondaryWeapon,'forward-mg');assert.equal(forward.getAttribute('aria-pressed'),'true');assert.equal(roof.getAttribute('aria-pressed'),'false');
  assert.equal(document.querySelector('.turret-orbit-secondary button').getAttribute('aria-label'),'COAX MG');
  for(const source of Object.values(inputs))assert.deepEqual(source,{primary:false,secondary:false,primaryPulseUntil:0,secondaryPulseUntil:0},'choosing a mount never fires it');
  await act(async()=>roof.click());assert.equal(roof.getAttribute('aria-pressed'),'true');assert.equal(document.querySelector('.turret-orbit-secondary button').getAttribute('aria-label'),'ROOF MG');
  const cannon=document.querySelector('.turret-orbit-primary button');
  for(const weapon of ['coax','basket','cannon']){
   await act(async()=>network.setState({snapshot:{entities:[{...network.getState().getMe(),combat:{enabled:true,weapon,fire:true,cannon_reload:0,coax_reload:.08,basket_reload:.08}}]}}));
   assert.equal(cannon.dataset.equipped,'true',`${weapon} firing cannot deselect the factory cannon`);
   assert.equal(cannon.hasAttribute('aria-pressed'),false,'firing is a momentary action, not an exclusive selection');
   assert.equal(cannon.disabled,false);assert.equal(cannon.dataset.ready,'true');
   assert.equal(cannon.querySelector('.cooldown-clock').dataset.progress,'1','MG reload must not affect the cannon ring');
  }
  await act(async()=>network.setState({snapshot:{entities:[{...network.getState().getMe(),combat:{enabled:true,weapon:'coax',fire:true,cannon_reload:1.5,coax_reload:.08,basket_reload:0}}]}}));
  assert.equal(cannon.dataset.equipped,'true');assert.equal(cannon.querySelector('.cooldown-clock').dataset.progress,'0.5','the cannon still shows its own real reload');

 }finally{if(root)await act(async()=>root.unmount());await vite?.close();dom.window.close();for(const[key,value]of old)if(value)Object.defineProperty(globalThis,key,value);else delete globalThis[key];}
});
