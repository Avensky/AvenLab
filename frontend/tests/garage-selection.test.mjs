import test from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToString} from 'react-dom/server';
import {createServer} from 'vite';

// Render the real picker boundary. Substitute only the 3D surface so a stray
// model mount is observable even without a WebGL context.
test('the garage falls back to the favorite while keeping the Abilities preview active',async()=>{
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
        export const PreviewLoadingStatus=({label})=>h('span',{'data-summoning':label});
        export const VehiclePreviewModel=({model,garageOpen})=>h('span',{'data-model':model,'data-garage-open':garageOpen});
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
      assert.match(render(),/data-garage/);assert.match(render(),/data-model="ae86"/);
      Object.assign(current,{hero:'mechanic',previewHero:'brz'});
      assert.match(render(),/data-model="fortuner"/);
      assert.match(render(),/data-summoning="Summoning vehicle"/);
      Object.assign(current,{hero:null,previewHero:null});assert.match(render(),/data-model="ae86"/);
      screen.screen='heroes';current.previewHero='mini';assert.match(render(),/data-model="mini"/);
      const {useCharacterPreviewStore}=await vite.ssrLoadModule('/src/game/characters/characterPreviewStore.ts');
      const {useVehicleStudioStore}=await vite.ssrLoadModule('/src/game/heroes/vehicleStudioStore.ts');
      const preview=useCharacterPreviewStore.getInitialState();
      const studio=useVehicleStudioStore.getInitialState(),previousTab=studio.activeTab;
      try {
        studio.activeTab='abilities';
        assert.match(render(),/data-garage-open="true"/);
        preview.insideCar=true;
        const wardrobe=renderToString(createElement(VehiclePreview,{awaitingHero:true,wardrobeOpen:true}));
        assert.match(wardrobe,/data-model="mini"/);
        assert.match(wardrobe,/data-garage-open="false"/);
        assert.match(render(),/data-model="mini"/);
      } finally { preview.insideCar=false;studio.activeTab=previousTab; }
    }finally{Object.assign(current,saved);screen.screen=original;}
  }finally{await vite.close();}
});
