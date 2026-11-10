import test from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToString} from 'react-dom/server';
import {createServer} from 'vite';

// Render the real picker boundary. Substitute only the 3D surface so a stray
// model mount is observable even without a WebGL context.
test('the garage mounts only an explicitly selected hero and removes it on clear',async()=>{
  const vite=await createServer({server:{middlewareMode:true,hmr:false,ws:false},appType:'custom',logLevel:'error',
    plugins:[{name:'garage-surface',enforce:'pre',
      transform(source,id){
        if(id.endsWith('/game/preview/VehiclePreview.tsx'))
          return source.replace(/from "(?:@react-three\/(?:fiber|drei)|\.\/(?:VehiclePreviewModel|GarageEnvironment|PreviewTurntable|PreviewLoadingSeal))"/g,'from "virtual:garage-surface"');
      },
      resolveId(id){if(id==='virtual:garage-surface')return '\0garage-test-surface';},
      load(id){if(id==='\0garage-test-surface')return `
        import {createElement as h} from 'react';
        export const useFrame=()=>{};
        export const useThree=fn=>fn({size:{width:1000,height:500},invalidate:()=>{}});
        export const Html=()=>null,OrbitControls=()=>null,PerspectiveCamera=()=>null;
        export const GarageEnvironment=()=>h('div',{'data-garage':true});
        export const PreviewTurntable=({children})=>h('div',null,children);
        export const PreviewLoadingSeal=({label})=>h('span',{'data-summoning':label});
        export const VehiclePreviewModel=({model})=>h('span',{'data-model':model});
      `;}
    }]});
  try{
    const {VehiclePreview}=await vite.ssrLoadModule('/src/game/preview/VehiclePreview.tsx');
    // useSyncExternalStore uses each store's initial snapshot during SSR.
    const {useUIStore:ui}=await vite.ssrLoadModule('/src/store/menus/uiStore.ts');
    const {useAlphaStore:alpha}=await vite.ssrLoadModule('/src/store/alpha/alphaStore.ts');
    const current=alpha.getInitialState(),screen=ui.getInitialState(),saved={hero:current.hero,previewHero:current.previewHero};
    const original=screen.screen;screen.screen='hero_select';
    const render=()=>renderToString(createElement(VehiclePreview,{awaitingHero:true}));
    try{
      Object.assign(current,{hero:null,previewHero:'brz'});
      assert.match(render(),/data-garage/);assert.doesNotMatch(render(),/data-model/);
      Object.assign(current,{hero:'mechanic',previewHero:'brz'});
      assert.match(render(),/data-model="fortuner"/);
      assert.match(render(),/data-summoning="Summoning vehicle"/);
      Object.assign(current,{hero:null,previewHero:null});assert.doesNotMatch(render(),/data-model/);
      screen.screen='heroes';current.previewHero='mini';assert.match(render(),/data-model="mini"/);
      const {useCharacterPreviewStore}=await vite.ssrLoadModule('/src/game/characters/characterPreviewStore.ts');
      const preview=useCharacterPreviewStore.getInitialState();
      try {
        preview.insideCar=true;
        assert.match(renderToString(createElement(VehiclePreview,{awaitingHero:true,wardrobeOpen:true})),/data-model="mini"/);
        assert.match(render(),/data-model="mini"/);
      } finally { preview.insideCar=false; }
    }finally{Object.assign(current,saved);screen.screen=original;}
  }finally{await vite.close();}
});
