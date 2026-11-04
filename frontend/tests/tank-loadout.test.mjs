import test from 'node:test';import assert from 'node:assert/strict';import {JSDOM} from 'jsdom';import {createServer} from 'vite';import {act,createElement as h} from 'react';import {createRoot} from 'react-dom/client';
test('tank slots request independent factory weapons, while unavailable guns and empty lock rings remain honest',async t=>{
 const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost/',pretendToBeVisual:true}),old=new Map();let vite,root;
 for(const[k,v]of Object.entries({window:dom.window,document:dom.window.document,navigator:dom.window.navigator,HTMLElement:dom.window.HTMLElement,Event:dom.window.Event,CustomEvent:dom.window.CustomEvent,localStorage:dom.window.localStorage,requestAnimationFrame:dom.window.requestAnimationFrame.bind(dom.window),cancelAnimationFrame:dom.window.cancelAnimationFrame.bind(dom.window),IS_REACT_ACT_ENVIRONMENT:true})){old.set(k,Object.getOwnPropertyDescriptor(globalThis,k));Object.defineProperty(globalThis,k,{value:v,writable:true,configurable:true});}
 document.hasFocus=()=>true;Object.defineProperty(document,'visibilityState',{value:'visible',configurable:true});
 try{
  vite=await createServer({server:{middlewareMode:true,hmr:false,ws:false},appType:'custom',logLevel:'error'});const load=p=>vite.ssrLoadModule('/src/'+p);
  const {createTankFireInputs,clearTankFireInputs,sampleTankFire}=await load('combat/tankLoadout.ts');
  await t.test('ready cannon has priority; roof MG fills its independent reload; one device release preserves another',()=>{
   const fire=createTankFireInputs();fire.keyboard.primary=true;fire.gamepad.secondary=true;
   assert.deepEqual(sampleTankFire(fire,'roof-mg',100,0),{weapon:'cannon',fire:true});
   assert.deepEqual(sampleTankFire(fire,'roof-mg',100,2.8),{weapon:'coax',fire:true});
   assert.deepEqual(sampleTankFire(fire,'roof-mg',100,undefined),{weapon:'cannon',fire:true},'missing telemetry never authorizes a cooldown or blocks a valid request');
   clearTankFireInputs(fire,'keyboard');assert(fire.gamepad.secondary);assert.deepEqual(sampleTankFire(fire,'roof-mg',100,2.8),{weapon:'coax',fire:true});
   assert.deepEqual(sampleTankFire(fire,'unavailable',100,0),{weapon:'cannon',fire:false},'unavailable secondary never falls back to a live gun');
   clearTankFireInputs(fire);assert.equal(sampleTankFire(fire,'roof-mg',100,0).fire,false);
  });
  const {useCombatStore:combat,tankFireInputs:fire}=await load('combat/combatStore.ts'),{useNetworkStore:network}=await load('store/session/networkStore.ts'),{useUIStore:ui}=await load('store/menus/uiStore.ts'),actions=await load('combat/turretControls.ts');
  const entity={id:'tank',vehicle_id:'tank',rotation:[0,0,0,1],combat:{weapon:'cannon',yaw:1,pitch:.1,cannon_reload:0,coax_reload:0,basket_reload:0},health:{defeated:false}};
  network.setState({connected:true,playerId:'tank',snapshot:{entities:[entity]}});ui.setState({screen:'sandbox',overlay:null,isModeLoading:false});combat.getState().setEnabled(true);combat.getState().selectSecondary('roof-mg');
  await t.test('secondary swaps clear only secondary requests; both small arms keep the fixed cannon usable',()=>{
   assert(actions.setWeaponHeld('keyboard','primary',true));assert(actions.setWeaponHeld('gamepad','secondary',true));
   assert(actions.cycleTankWeapon());assert.equal(combat.getState().secondaryWeapon,'forward-mg');assert(fire.keyboard.primary);assert(!fire.gamepad.secondary);assert.equal(fire.gamepad.secondaryPulseUntil,0);
   assert.equal(actions.requestSecondaryFire(),true);assert.equal(actions.requestPrimaryFire(),true);
   assert.equal(sampleTankFire(fire,'unavailable',performance.now(),0).weapon,'cannon');
   actions.releaseWeaponSource('keyboard');assert.equal(fire.keyboard.primaryPulseUntil,0);actions.releaseWeaponSource('pointer');
  });
  const {TurretLockButton}=await load('combat/TurretLockButton.tsx');root=createRoot(document.getElementById('root'));
  await t.test('lock ring briefly fills and drains, then holds its true state',async()=>{
   combat.getState().setOrientationLocked(false);combat.setState({turretLockReadyAt:0});await act(async()=>root.render(h(TurretLockButton)));
   const progress=()=>document.querySelector('.cooldown-clock').dataset.progress,button=()=>document.querySelector('button');
   assert.equal(progress(),'0');assert.equal(document.querySelector('.cooldown-clock').getAttribute('aria-label'),'Turret free aim');
   await act(async()=>button().click());assert.equal(button().disabled,true);await act(async()=>new Promise(resolve=>setTimeout(resolve,80)));assert(Number(progress())>0&&Number(progress())<1,'locking visibly fills');await act(async()=>new Promise(resolve=>setTimeout(resolve,210)));assert.equal(progress(),'1','no timed refill replaces the locked state');
   await act(async()=>button().click());assert.equal(button().disabled,true);await act(async()=>new Promise(resolve=>setTimeout(resolve,80)));assert(Number(progress())>0&&Number(progress())<1,'unlocking visibly drains');await act(async()=>new Promise(resolve=>setTimeout(resolve,210)));assert.equal(progress(),'0','unlocked state stays empty after debounce');
   await act(async()=>{combat.getState().setOrientationLocked(true);combat.getState().setScope(true);});assert.equal(progress(),'0');await act(async()=>combat.getState().setScope(false));assert.equal(progress(),'1','scope restores the previous angle lock');
  });
  await t.test('defeat/menu/blur/CAN cleanup clears every held slot and queued pulse',async()=>{
   const {CombatHUD}=await load('combat/CombatHUD.tsx'),{useCanDataStore:can}=await load('store/recon/canDataStore.ts');await act(async()=>root.render(h(CombatHUD)));combat.getState().selectSecondary('roof-mg');
   const prime=()=>{actions.setWeaponHeld('keyboard','primary',true);actions.setWeaponHeld('gamepad','secondary',true);actions.requestSecondaryFire();};
   const empty=()=>{for(const source of ['keyboard','gamepad','pointer'])assert.deepEqual(fire[source],{primary:false,secondary:false,primaryPulseUntil:0,secondaryPulseUntil:0});};
   prime();await act(async()=>window.dispatchEvent(new window.Event('blur')));empty();
   prime();await act(async()=>ui.setState({overlay:'pause'}));empty();await act(async()=>ui.setState({overlay:null}));
   prime();await act(async()=>can.setState({commandOpen:true}));empty();await act(async()=>can.setState({commandOpen:false}));
   prime();await act(async()=>network.setState({snapshot:{entities:[{...entity,health:{defeated:true}}]}}));empty();
  });
 }finally{if(root)await act(async()=>root.unmount());await vite?.close();dom.window.close();for(const[k,v]of old)if(v)Object.defineProperty(globalThis,k,v);else delete globalThis[k];}
});
