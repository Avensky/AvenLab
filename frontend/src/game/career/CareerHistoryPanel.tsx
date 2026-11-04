import {useEffect,useRef,useState} from 'react';
import {HEROES} from '../../store/alpha/alphaStore';
import {requestSocial} from '../../net/socialClient';
import {openStoredMatch} from '../../store/session/matchResultsStore';
import {HeroPortrait} from '../alpha/HeroPortrait';
import {CAREER_AWARD_LABELS,careerModeLabel,formatCareerValue} from './careerData';
import {CareerHistoryLoader,type CareerHistoryState} from './careerHistory';

const emptyState:CareerHistoryState={matches:[],cursor:null,loading:false,loaded:false,error:'',opening:null};
function endedLabel(timestamp:number){const date=new Date(timestamp<1e12?timestamp*1000:timestamp);return Number.isNaN(date.getTime())?'Date unavailable':date.toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'});}

type HistoryProps={owner:string|null;mode:string;hero:string};
export function CareerHistoryPanel(props:HistoryProps) {
 return <CareerHistoryRequest key={`${props.owner}:${props.mode}:${props.hero}`} {...props}/>;
}
function CareerHistoryRequest({owner,mode,hero}:HistoryProps) {
 const [state,setState]=useState(emptyState);
 const loader=useRef<CareerHistoryLoader|null>(null);
 useEffect(()=>{const current=new CareerHistoryLoader(requestSocial,setState,mode,hero);loader.current=current;if(owner)void current.loadMore();return()=>{current.dispose();if(loader.current===current)loader.current=null;};},[owner,mode,hero]);
 return <section className="career-history"><div className="career-section-heading"><div><p className="career-eyebrow">MATCH ARCHIVE</p><h2>Your recent matches</h2></div><span>{state.matches.length} loaded</span></div>
 {!owner&&<div className="career-empty"><h3>Connect your player profile</h3><p>Your saved results belong to your player profile.</p></div>}
 {owner&&state.loaded&&!state.matches.length&&<div className="career-empty"><span aria-hidden="true">◷</span><h3>No recorded matches yet</h3><p>Completed matches will appear here. Try a different mode or hero filter.</p></div>}
 <div className="career-history-list" data-controller-row data-controller-columns="1">{state.matches.map(match=>{const definition=HEROES.find(item=>item.id===match.hero);return <button className="career-history-row" type="button" key={match.match_id} data-outcome={match.outcome} disabled={!!state.opening} onClick={()=>void loader.current?.openMatch(match.match_id,openStoredMatch)} aria-label={`View ${careerModeLabel(match.mode,match.training,match.team_size)} ${match.outcome} on ${match.map}`}><span className="career-history-portrait"><HeroPortrait hero={match.hero}/></span><span className="career-history-main"><strong>{match.map.replaceAll('_',' ')}</strong><small>{careerModeLabel(match.mode,match.training,match.team_size)} · {definition?.name??match.hero}</small><span className="career-history-awards">{match.awards.map(award=><span key={award}>{CAREER_AWARD_LABELS[award]}</span>)}</span></span><span className="career-history-result"><strong>{`${match.outcome.toUpperCase()}${match.training?' · TRAINING':''}`}</strong><small>{formatCareerValue(match.duration_s,'duration')} · {endedLabel(match.ended_at)}</small></span><span className="career-history-action">{state.opening===match.match_id?'OPENING…':'VIEW ›'}</span></button>;})}</div>
 {state.error&&<p role="alert" className="career-notice">{state.error}</p>}
 <div data-controller-row className="career-history-pagination">{owner&&(!state.loaded||state.cursor!==null)&&<button type="button" className="menu-control" disabled={state.loading} onClick={()=>void loader.current?.loadMore()}>{state.loading?'LOADING…':state.error?'RETRY HISTORY':state.loaded?'LOAD MORE':'LOAD HISTORY'}</button>}<span role="status" aria-live="polite">{state.loading?'Loading saved results…':state.loaded&&state.cursor===null&&state.matches.length?'You have reached the end of your recorded history.':''}</span></div>
 </section>;
}
