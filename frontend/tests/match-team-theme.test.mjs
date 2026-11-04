import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {createServer} from 'vite';
import {createElement as h, act} from 'react';
import {createRoot} from 'react-dom/client';
import {applyMatchTeamTheme, applyTeamIdentityColors, confirmedMatchTeam, MATCH_TEAM_COLORS} from '../src/theme/matchTeamTheme.ts';
import {UI_THEMES} from '../src/theme/catalog.ts';
import {GARAGE_LIGHT_COLORS} from '../src/theme/garageLighting.ts';

const context = {
 screen:'sandbox',loading:false,connected:true,playerId:'me',roomId:7,
 entityId:'me',entityRoom:7,entityTeam:'red',activeMode:'quickplay',
 activeWorld:7,activeTeam:'red',matchMode:'quickplay',
};

test('only a confirmed local match seat can choose a team accent',()=>{
 for(const mode of ['quickplay','competitive','skirmish']){
  assert.equal(confirmedMatchTeam({...context,activeMode:mode,matchMode:mode}),'red');
  assert.equal(confirmedMatchTeam({...context,activeMode:mode,matchMode:mode,activeTeam:'blue',entityTeam:'blue'}),'blue');
 }
 for(const patch of [
  {screen:'hero_select'},{screen:'main'},{screen:'world_builder'},{loading:true},
  {connected:false},{entityId:'someone-else'},{entityRoom:9},{roomId:9},
  {activeMode:'sandbox',matchMode:'sandbox'},{activeMode:'editor',matchMode:'editor'},
  {activeTeam:'blue'},{activeTeam:'unknown',entityTeam:'unknown'},
  {matchMode:undefined},{matchMode:'competitive'}, {activeWorld:undefined,entityRoom:undefined},
 ])assert.equal(confirmedMatchTeam({...context,...patch}),null,JSON.stringify(patch));
});

test('red and blue accent text remains readable across the app palettes',()=>{
 const luminance = color => {
  const values = color.slice(1).match(/../g).map(value=>parseInt(value,16)/255).map(value=>value<=.04045?value/12.92:((value+.055)/1.055)**2.4);
  return values[0]*.2126+values[1]*.7152+values[2]*.0722;
 };
 for(const [name,palette] of Object.entries(UI_THEMES))for(const team of ['red','blue']){
  const a=luminance(MATCH_TEAM_COLORS[team][palette.scheme]),b=luminance(palette.panel);
  assert((Math.max(a,b)+.05)/(Math.min(a,b)+.05)>=4.5,`${name} ${team}`);
 }
});

test('warm Red team identity stays distinct from Strawberry and survives outside a live match',()=>{
 const dom=new JSDOM(''),html=dom.window.document.documentElement;
 try{
  html.style.setProperty('--app-accent',UI_THEMES.strawberry.accent);
  html.style.setProperty('--app-panel',UI_THEMES.strawberry.panel);
  for(const value of Object.values(MATCH_TEAM_COLORS.red)){
   const [r,g,b]=value.slice(1).match(/../g).map(channel=>parseInt(channel,16));
   assert(r>g&&g>b,'team red stays on the warm red side instead of Strawberry magenta');
   assert.notEqual(value,UI_THEMES.strawberry.accent);
   assert.notEqual(value,GARAGE_LIGHT_COLORS.strawberry);
  }
  assert.equal(GARAGE_LIGHT_COLORS.strawberry,'#ff3caf','the saved pink light palette stays intact');
  assert.equal(UI_THEMES.strawberry.accent,'#af126f','the saved Strawberry app palette stays intact');
  applyTeamIdentityColors(html,'dark');
  assert.equal(html.style.getPropertyValue('--team-red'),MATCH_TEAM_COLORS.red.dark);
  applyMatchTeamTheme(html,'red','light');
  assert.equal(html.style.getPropertyValue('--match-accent'),MATCH_TEAM_COLORS.red.light);
  assert.equal(html.style.getPropertyValue('--team-red-glow'),MATCH_TEAM_COLORS.red.glow);
  applyMatchTeamTheme(html,null,'light');
  assert.equal(html.style.getPropertyValue('--match-accent'),'');
  assert.equal(html.style.getPropertyValue('--team-red'),MATCH_TEAM_COLORS.red.light,'career and results retain readable team identities');
  assert.equal(html.style.getPropertyValue('--app-accent'),UI_THEMES.strawberry.accent);
  assert.equal(html.style.getPropertyValue('--app-panel'),UI_THEMES.strawberry.panel);
 }finally{dom.window.close();}
});

test('live team scope restores on leave and nearby snapshots do not rewrite the theme',async()=>{
 const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost/',pretendToBeVisual:true}),original=new Map();
 for(const[key,value]of Object.entries({window:dom.window,document:dom.window.document,navigator:dom.window.navigator,HTMLElement:dom.window.HTMLElement,localStorage:dom.window.localStorage,IS_REACT_ACT_ENVIRONMENT:true})){
  original.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{value,configurable:true,writable:true});
 }
 const vite=await createServer({cacheDir:'node_modules/.vite-match-team-theme-test',server:{middlewareMode:true,hmr:false,ws:false},appType:'custom',logLevel:'error',optimizeDeps:{noDiscovery:true,include:[]}}),load=p=>vite.ssrLoadModule('/src/'+p),root=createRoot(document.getElementById('root'));
 try{
  const {useAppTheme}=await load('theme/useAppTheme.ts'),{usePreferencesStore:prefs}=await load('store/preferences/preferencesStore.ts');
  const {useNetworkStore:network}=await load('store/session/networkStore.ts'),{useSocialStore:social}=await load('store/social/socialStore.ts'),{useUIStore:ui}=await load('store/menus/uiStore.ts');
  const {useHeroLoadouts:loadouts}=await load('vehicles/cosmetics/heroLoadouts.ts'),{WheelArtwork}=await load('ui/Cockpit/WheelArtwork.tsx');
  const me={id:'me',room_id:7,kind:'vehicle',vehicle_id:'brz',team:'red',position:[0,1,0],rotation:[0,0,0,1],appearance:{body:'#ffffff'}};
  let tick=0,renders=0;
  const send=(team='red',mode='quickplay')=>network.getState().setSnapshot({tick:++tick,match_state:{mode},entities:[{...me,team},...[1,2,3].map(i=>({...me,id:`ally-${i}`,team,position:[tick+i,1,i]}))]},performance.now());
  social.setState({view:{profile:{id:'profile'},alpha:{active:{mode:'quickplay',world_id:7,team:'red',hero:'brz'}}}});
  ui.setState({screen:'sandbox',overlay:null,isModeLoading:false});network.setState({connected:true,playerId:'me',room_id:7});send();
  prefs.getState().update({theme:'strawberry',vehicleCosmetics:{matchCockpit:true}});
  const savedPreferences=JSON.stringify(prefs.getState()),savedLoadouts=JSON.stringify(loadouts.getState());
  function Host(){renders++;useAppTheme();return h('div',{className:'driving-hud'},h(WheelArtwork));}
  await act(async()=>root.render(h(Host)));
  const html=document.documentElement;
  assert.equal(html.dataset.matchTeam,'red');assert.equal(html.style.getPropertyValue('--match-accent'),MATCH_TEAM_COLORS.red.light);
  assert.equal(html.style.getPropertyValue('--match-team-glow'),MATCH_TEAM_COLORS.red.glow);
  assert.equal(html.style.getPropertyValue('--app-accent'),UI_THEMES.strawberry.accent,'the saved app palette is still authoritative');
  assert.equal(html.style.getPropertyValue('--vehicle-accent'),'#ffffff','paint/stitch preference is preserved outside the scoped wheel override');
  assert(document.querySelector('.wheel-artwork path[stroke="var(--wheel-stitch, var(--vehicle-accent, #a13c3d))"]'));
  const before=renders;
  await act(async()=>{for(let i=0;i<30;i++)send();});
  assert.equal(renders,before,'position-only teammate packets do not rerender the theme owner');
  assert.equal(JSON.stringify(prefs.getState()),savedPreferences);assert.equal(JSON.stringify(loadouts.getState()),savedLoadouts);
  for(const theme of ['navy','white','strawberry']){
   await act(async()=>prefs.getState().update({theme}));
   assert.equal(html.dataset.matchTeam,'red');
   assert.equal(html.style.getPropertyValue('--app-accent'),UI_THEMES[theme].accent,`${theme} remains the main HUD accent during a Red match`);
   assert.equal(html.style.getPropertyValue('--app-panel'),UI_THEMES[theme].panel,`${theme} keeps its own HUD surfaces`);
   assert.equal(html.style.getPropertyValue('--app-text'),UI_THEMES[theme].text,`${theme} keeps readable HUD text`);
   assert.equal(html.style.getPropertyValue('--match-team-glow'),MATCH_TEAM_COLORS.red.glow,'Red identity remains a separate explicit glow');
   assert.equal(html.style.getPropertyValue('--vehicle-accent'),'#ffffff','team indication does not replace owned paint');
  }
  assert.equal(JSON.stringify(loadouts.getState()),savedLoadouts,'live theme changes never mutate the hero collection');
  await act(async()=>{social.setState({view:{...social.getState().view,alpha:{active:{mode:'quickplay',world_id:7,team:'blue',hero:'brz'}}}});send('blue');});
  assert.equal(html.dataset.matchTeam,'blue');assert.equal(html.style.getPropertyValue('--match-accent'),MATCH_TEAM_COLORS.blue.light);
  await act(async()=>prefs.getState().update({theme:'navy'}));
  assert.equal(html.style.getPropertyValue('--match-accent'),MATCH_TEAM_COLORS.blue.dark);assert.equal(html.style.getPropertyValue('--app-accent'),UI_THEMES.navy.accent);
  await act(async()=>network.setState({connected:false}));
  assert.equal(html.dataset.matchTeam,undefined);assert.equal(html.style.getPropertyValue('--match-accent'),'');assert.equal(html.style.getPropertyValue('--match-team-glow'),'');
  await act(async()=>network.setState({connected:true}));assert.equal(html.dataset.matchTeam,'blue');
  await act(async()=>ui.setState({screen:'heroes'}));assert.equal(html.dataset.matchTeam,undefined);
  await act(async()=>{ui.setState({screen:'sandbox'});network.getState().setSnapshot({tick:++tick,entities:[{...me,team:'blue'}]},performance.now());});
  assert.equal(html.dataset.matchTeam,undefined,'custom/practice worlds never inherit a stale match accent');
  assert.equal(html.style.getPropertyValue('--vehicle-accent'),'#ffffff');
 }finally{await act(async()=>root.unmount());await vite.close();dom.window.close();for(const[key,value]of original){if(value)Object.defineProperty(globalThis,key,value);else delete globalThis[key];}}
});
