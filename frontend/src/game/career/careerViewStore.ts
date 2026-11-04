import {create} from 'zustand';

export type CareerTab='overview'|'statistics'|'history'|'progression'|'favorites'|'customize'|'achievements'|'leaderboard';
export const CAREER_TABS:{id:CareerTab;label:string}[]=[{id:'overview',label:'Overview'},{id:'statistics',label:'Statistics'},{id:'history',label:'History'},{id:'progression',label:'Progression'},{id:'favorites',label:'Favorites'},{id:'customize',label:'Customize'},{id:'achievements',label:'Achievements'},{id:'leaderboard',label:'Leaderboard'}];
/** Only navigation preferences live here. Server records stay server-owned. */
export const useCareerViewStore=create<{tab:CareerTab;mode:string;hero:string;selectTab:(tab:CareerTab)=>void;setMode:(mode:string)=>void;setHero:(hero:string)=>void}>(set=>({tab:'overview',mode:'all',hero:'all',selectTab:tab=>set({tab}),setMode:mode=>set({mode}),setHero:hero=>set({hero})}));
