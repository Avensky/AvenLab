import type {CareerHistoryEntry, CareerHistoryPage} from './careerTypes';

type Request=(action:string,fields:Record<string,unknown>)=>Promise<Record<string,unknown>>;
export type CareerHistoryState={matches:CareerHistoryEntry[];cursor:string|null;loading:boolean;loaded:boolean;error:string;opening:string|null};
const initial=():CareerHistoryState=>({matches:[],cursor:null,loading:false,loaded:false,error:'',opening:null});
/** A profile/filter-scoped request owner. Late responses cannot populate a new
 * profile; failed pages retain the records already loaded and can be retried. */
export class CareerHistoryLoader {
 state=initial();
 private generation=0;
 private disposed=false;
 private request:Request;
 private changed:(value:CareerHistoryState)=>void;
 private mode:string;
 private hero:string;
 constructor(request:Request,changed:(value:CareerHistoryState)=>void,mode='all',hero='all'){this.request=request;this.changed=changed;this.mode=mode;this.hero=hero;}
 private publish(patch:Partial<CareerHistoryState>){if(this.disposed)return;this.state={...this.state,...patch};this.changed(this.state);}
 dispose(){this.disposed=true;this.generation++;}
 async loadMore(){
  if(this.disposed||this.state.loading||(this.state.loaded&&this.state.cursor===null))return;
  const generation=this.generation;
  this.publish({loading:true,error:''});
  try{
   const page=await this.request('career_history',{limit:20,...(this.state.cursor?{cursor:this.state.cursor}:{}),...(this.mode==='all'?{}:{mode:this.mode}),...(this.hero==='all'?{}:{hero:this.hero})}) as unknown as CareerHistoryPage;
   if(this.disposed||generation!==this.generation)return;
   if(!Array.isArray(page.matches)||(page.next_cursor!==null&&typeof page.next_cursor!=='string'))throw Error('The server returned an unreadable history page.');
   const seen=new Set(this.state.matches.map(match=>match.match_id));
   const matches=page.matches.filter(match=>{if(typeof match?.match_id!=='string'||seen.has(match.match_id))return false;seen.add(match.match_id);return true;});
   this.publish({matches:[...this.state.matches,...matches],cursor:page.next_cursor,loaded:true,loading:false});
  }catch(error){if(generation===this.generation)this.publish({loading:false,error:error instanceof Error?error.message:'Could not load match history.'});}
 }
 async openMatch(matchId:string,onOpen:(record:unknown)=>boolean){
  if(this.disposed||this.state.opening)return;
  const generation=this.generation;this.publish({opening:matchId,error:''});
  try{
   const result=await this.request('career_match',{match_id:matchId});
   if(this.disposed||generation!==this.generation)return;
   if(!onOpen(result.match))throw Error('The stored match could not be displayed.');
   this.publish({opening:null});
  }catch(error){if(generation===this.generation)this.publish({opening:null,error:error instanceof Error?error.message:'Could not open this match.'});}
 }
}
