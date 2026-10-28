import {create} from 'zustand';
import type {Point} from '../navigation/roadNavigation';
export type NavigationMission={title:string;objective:string;target:Point|null};
// Mission adapters can publish an objective without replacing the user's GPS route.
// Today's sandbox supplies none; no match state is invented by the HUD.
export const useNavigationStore=create<{
 destination:Point|null;setDestination:(p:Point|null)=>void;
 mission:NavigationMission|null;setMission:(mission:NavigationMission|null)=>void;
}>(set=>({
 destination:null,setDestination:p=>{if(p===null||Number.isFinite(p.x)&&Number.isFinite(p.z))set({destination:p});},
 mission:null,setMission:mission=>{
  if(mission===null){set({mission:null});return;}
  if(!mission.title.trim()||!mission.objective.trim()||mission.target&&(!Number.isFinite(mission.target.x)||!Number.isFinite(mission.target.z)))return;
  set({mission:{title:mission.title.trim().slice(0,100),objective:mission.objective.trim().slice(0,200),target:mission.target?{...mission.target}:null}});
 },
}));
