import {create} from 'zustand';

export type MatchView='composition'|'table';
export type MatchTeamFilter='all'|'red'|'blue';
export const MATCH_TEAM_FILTERS=['all','red','blue'] as const;
export function nextMatchTeamFilter(current:MatchTeamFilter,direction:number):MatchTeamFilter{return MATCH_TEAM_FILTERS[(MATCH_TEAM_FILTERS.indexOf(current)+(direction<0?-1:1)+MATCH_TEAM_FILTERS.length)%MATCH_TEAM_FILTERS.length];}

/** Display state only. Holding Tab never changes the world or vehicle inputs.
 * A mobile pin survives Tab release; lifecycle changes close both sources. */
export const useScoreboardStore=create<{
 held:boolean;
 pinned:boolean;
 view:MatchView;
 teamFilter:MatchTeamFilter;
 setTeamFilter:(team:MatchTeamFilter)=>void;
 cycleTeamFilter:(direction:number)=>void;
 setView:(view:MatchView)=>void;
 /** A fresh round starts with the live table; opening/closing preserves choice. */
 resetView:()=>void;
 setHeld:(held:boolean)=>void;
 toggle:()=>void;
 close:()=>void;
}>((set,get)=>({
 held:false,pinned:false,view:'table',teamFilter:'all',
 setTeamFilter:teamFilter=>set({teamFilter}),
 cycleTeamFilter:direction=>set(state=>({teamFilter:nextMatchTeamFilter(state.teamFilter,direction)})),
 setView:view=>set({view}),
 resetView:()=>set({view:'table',teamFilter:'all'}),
 setHeld:held=>{if(get().held!==held) set({held});},
 toggle:()=>set(s=>({pinned:!s.pinned})),
 close:()=>{if(get().held || get().pinned) set({held:false,pinned:false});},
}));
export const setScoreboardHeld=(held:boolean)=>useScoreboardStore.getState().setHeld(held);
