import {requestSocial} from '../../net/socialClient';
import {useAlphaStore,type GameMode} from '../../store/alpha/alphaStore';
import {useUIStore} from '../../store/menus/uiStore';
import {closeMatchResults,useMatchResultsStore} from '../../store/session/matchResultsStore';
import {joinSelectedMode} from '../alpha/sessionActions';

/** Server acknowledgement owns leaving/requeueing. A failed request preserves
 * the archived result and gives the player an explicit retry. History has no
 * permission to send session actions. */
export async function leaveMatchResults(playAgain=false):Promise<void>{
 const state=useMatchResultsStore.getState(),matchId=state.record?.match_id;
 if(state.source==='history'){closeMatchResults();return;}
 if(!matchId||state.busy||useUIStore.getState().overlay!=='match_results')return;
 useMatchResultsStore.setState({busy:true,error:null});
 const current=()=>useMatchResultsStore.getState().record===state.record&&useMatchResultsStore.getState().source==='live';
 try{
  if(!state.leftWorld){
   await requestSocial('mode_leave');
   if(!current())return;
   useMatchResultsStore.setState({leftWorld:true});
  }
  const mode=state.record!.mode;
  if(['quickplay','competitive','skirmish','sandbox','editor'].includes(mode))useAlphaStore.getState().restoreMode(mode as GameMode,state.record!.team_size??undefined);
  if(playAgain){
   await joinSelectedMode();
  }else closeMatchResults();
 }catch(error){
  if(current())useMatchResultsStore.setState({error:error instanceof Error?error.message:'Unable to contact the game server. Try again.'});
 }finally{
  if(current())useMatchResultsStore.setState({busy:false});
 }
}
export const playAgainFromResults=()=>leaveMatchResults(true);
