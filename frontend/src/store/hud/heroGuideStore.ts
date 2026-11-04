import {create} from 'zustand';
import {HEROES,useAlphaStore} from '../alpha/alphaStore';
import {useUIStore,type UIOverlay} from '../menus/uiStore';
import {useNetworkStore} from '../session/networkStore';
import {useSocialStore} from '../social/socialStore';
import {useHeroLoadouts} from '../../vehicles/cosmetics/heroLoadouts';

const valid=(hero:unknown):hero is string=>typeof hero==='string'&&HEROES.some(item=>item.id===hero);
export const useHeroGuideStore=create<{
 selectedHero:string;
 returnOverlay:UIOverlay;
 returnGarageHero:string|null;
 chooseHero:(hero:string)=>void;
}>(set=>({
 selectedHero:'tank',returnOverlay:null,returnGarageHero:null,
 chooseHero:hero=>{
  if(!valid(hero))return;
  set({selectedHero:hero});
  // The existing garage owns its camera/model. Browsing the guide never spawns
  // or selects another vehicle in a live world, nor changes the player's main.
  if(useUIStore.getState().screen==='heroes')useAlphaStore.getState().preview(hero);
 },
}));

export function openHeroGuide(hero?:string){
 const ui=useUIStore.getState();
 const active=useSocialStore.getState().view?.alpha?.active?.hero;
 const vehicle=useNetworkStore.getState().getMe()?.vehicle_id;
 const fromVehicle=HEROES.find(item=>item.vehicle===vehicle)?.id;
 const activeMatches=HEROES.some(item=>item.id===active&&item.vehicle===vehicle);
 const liveHero=vehicle?(activeMatches?active:fromVehicle):active;
 const candidates=[hero,ui.screen==='sandbox'?liveHero:useAlphaStore.getState().previewHero,fromVehicle,useHeroLoadouts.getState().defaultHero,'tank'];
 const selected=candidates.find(valid)!;
 if(ui.overlay!=='hero_abilities')useHeroGuideStore.setState({returnOverlay:ui.overlay,returnGarageHero:ui.screen==='heroes'?useAlphaStore.getState().previewHero:null});
 useHeroGuideStore.getState().chooseHero(selected);
 useUIStore.setState({overlay:'hero_abilities'});
}

export function closeHeroGuide(){
 if(useUIStore.getState().overlay!=='hero_abilities')return;
 const guide=useHeroGuideStore.getState();
 if(useUIStore.getState().screen==='heroes'){if(valid(guide.returnGarageHero))useAlphaStore.getState().preview(guide.returnGarageHero);else useAlphaStore.setState({previewHero:null});}
 useUIStore.setState({overlay:guide.returnOverlay});
 requestAnimationFrame(()=>document.querySelector<HTMLElement>('[data-open-hero-abilities]')?.focus({preventScroll:true}));
}
