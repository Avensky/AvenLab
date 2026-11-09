import {create} from 'zustand';
import {HEROES} from '../alpha/alphaStore';
import {useUIStore,type UIOverlay} from '../menus/uiStore';
import {useNetworkStore} from '../session/networkStore';

export const useHeroGuideStore=create<{
 selectedHero:string|null;
 returnOverlay:UIOverlay;
}>(()=>({selectedHero:null,returnOverlay:null}));

export function openHeroGuide(){
 const ui=useUIStore.getState();
 if(ui.screen!=='sandbox'||ui.overlay==='hero_abilities')return;
 const vehicle=useNetworkStore.getState().getMe()?.vehicle_id;
 const selected=HEROES.find(item=>item.vehicle===vehicle);
 if(!selected)return;
 useHeroGuideStore.setState({selectedHero:selected.id,returnOverlay:ui.overlay});
 useUIStore.setState({overlay:'hero_abilities'});
}

export function closeHeroGuide(){
 if(useUIStore.getState().overlay!=='hero_abilities')return;
 const guide=useHeroGuideStore.getState();
 useUIStore.setState({overlay:guide.returnOverlay});
}
