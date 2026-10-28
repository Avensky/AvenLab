import {create} from 'zustand';
import type {Point} from '../navigation/roadNavigation';
export const useNavigationStore=create<{destination:Point|null;setDestination:(p:Point|null)=>void}>(set=>({destination:null,setDestination:p=>{if(p===null||Number.isFinite(p.x)&&Number.isFinite(p.z))set({destination:p});}}));
