import {nextMatchTeamFilter,type MatchTeamFilter} from "../hud/scoreboardStore";
import {create} from 'zustand';
import type {CareerMatch} from '../../game/career/careerTypes';
import {parseMatchResult,type ResultTab} from '../../game/results/resultData';
import {useUIStore,type MenuScreen,type UIOverlay} from '../menus/uiStore';
import {useSocialStore} from '../social/socialStore';

export type ResultsSource='live'|'history';
type ResultsState={
 record:CareerMatch|null;source:ResultsSource;profileId:string|null;
 tab:ResultTab;teamFilter:MatchTeamFilter;selectedPlayer:string|null;returnScreen:MenuScreen;returnOverlay:UIOverlay;
 busy:boolean;error:string|null;leftWorld:boolean;
 setTeamFilter:(filter:MatchTeamFilter)=>void;cycleTeamFilter:(direction:number)=>void;
 selectTab:(tab:ResultTab)=>void;selectPlayer:(id:string)=>void;
};
export const useMatchResultsStore=create<ResultsState>(set=>({
 record:null,source:'live',profileId:null,tab:'awards',teamFilter:'all',selectedPlayer:null,
 returnScreen:'career',returnOverlay:null,busy:false,error:null,leftWorld:false,
 setTeamFilter:teamFilter=>set({teamFilter}),cycleTeamFilter:direction=>set(state=>({teamFilter:nextMatchTeamFilter(state.teamFilter,direction)})),
 selectTab:tab=>set({tab}),selectPlayer:selectedPlayer=>set({selectedPlayer}),
}));
// An ended match may be delivered more than once after reconnect. A profile's
// acknowledged result must never pull them out of a new queue or match.
const received=new Set<string>();
function remember(key:string){received.add(key);if(received.size>256)received.delete(received.values().next().value!);}
function show(record:CareerMatch,source:ResultsSource,profileId:string|null){
 const ui=useUIStore.getState(),current=useMatchResultsStore.getState();
 useMatchResultsStore.setState({record,source,profileId,tab:'awards',teamFilter:'all',selectedPlayer:record.participants.find(player=>player.profile_id===profileId)?.profile_id??record.participants[0]?.profile_id??null,busy:false,error:null,leftWorld:false,
  returnScreen:ui.overlay==='match_results'?current.returnScreen:ui.screen,
  returnOverlay:ui.overlay==='match_results'?current.returnOverlay:ui.overlay});
 useUIStore.setState({overlay:'match_results'});
}
export function receiveMatchResult(value:unknown):boolean{
 const record=parseMatchResult(value),profileId=useSocialStore.getState().view?.profile.id??null;
 if(!record||!profileId||!record.participants.some(player=>player.profile_id===profileId))return false;
 const key=JSON.stringify([profileId,record.match_id]);
 if(received.has(key))return true;
 remember(key);show(record,'live',profileId);return true;
}
export function openStoredMatch(value:unknown):boolean{
 const record=parseMatchResult(value);
 if(!record)return false;
 show(record,'history',useSocialStore.getState().view?.profile.id??null);return true;
}
/** History restores its caller. Live callers close only after mode_leave has
 * succeeded; use the result actions rather than dismissing a live match. */
export function closeMatchResults(){
 const state=useMatchResultsStore.getState();
 if(useUIStore.getState().overlay!=='match_results')return;
 if(state.source==='history')useUIStore.setState({screen:state.returnScreen,overlay:state.returnOverlay});
 else if(state.leftWorld)useUIStore.setState({screen:'mode_select',overlay:null});
 else return;
 useMatchResultsStore.setState({busy:false,error:null});
}
