import type { MotionState } from "../../store/session/networkViews";
import { useMotionView } from "../../store/session/networkViews";
import {matchModeLabel,modeTeamSize} from '../../store/alpha/alphaStore';
import {useCallback,useEffect,useRef,useState,type CSSProperties} from 'react';
import {isTypingTarget} from '../../controls/inputRouting';
import {ControllerAction,ControlGlyph} from '../../components/controller';
import {useScoreboardStore} from '../../store/hud/scoreboardStore';
import {useUIStore} from '../../store/menus/uiStore';
import {snapshotEntity,useNetworkStore} from '../../store/session/networkStore';
import {useSocialStore} from '../../store/social/socialStore';
import {preMatchPlayers,preMatchEnemiesRevealed,scoreboardPlayers,retainScoreboardPlayers,type ScoreboardPlayer} from './scoreboardData';
import {MatchTeamComposition,MatchStatsTable,MatchPlayerDetails,MatchViewTabs,MatchTeamFilterTabs} from './MatchPresentation';
import {useScoreboardVisible} from './useScoreboardVisible';
import {shallow} from 'zustand/vanilla/shallow';
import './matchScoreboard.css';

type BoardData={session:string;players:ScoreboardPlayer[];stale:boolean;mode:string;teamSize:3|5};
function boardSession(state: MotionState) {
  const room = snapshotEntity(state.snapshot, state.playerId)?.room_id ?? state.room_id ?? '';
  return `${state.playerId}:${room}`;
}
function readBoard():BoardData{
 const network=useNetworkStore.getState(),view=useSocialStore.getState().view;
 const received=network.snapshot?.received_at_ms;
 const staging=useUIStore.getState().screen==='hero_select';
 return {session:boardSession(network),players:staging?preMatchPlayers(view,preMatchEnemiesRevealed(view,network.connected)):scoreboardPlayers(network.snapshot,network.playerId,view),
  stale:!staging && (received===undefined||!Number.isFinite(received)||performance.now()-received>1000),
  mode:matchModeLabel(view?.alpha?.active?.mode??'practice',view?.alpha?.active?.team_size),teamSize:modeTeamSize(view?.alpha?.active?.mode??'',view?.alpha?.active?.team_size)};
}

/** Session totals update at a readable 4 Hz, never once per rendered physics
 * pose. This overlay keeps the world mounted and does not edit gameplay state. */
export function MatchScoreboard({onAbilities}:{onAbilities?:()=>void}){
 const staging=useUIStore(s=>s.screen==='hero_select');
 const close=useScoreboardStore(s=>s.close);
 const view=useScoreboardStore(s=>s.view),setView=useScoreboardStore(s=>s.setView);
 const teamFilter=useScoreboardStore(s=>s.teamFilter),setTeamFilter=useScoreboardStore(s=>s.setTeamFilter),cycleTeamFilter=useScoreboardStore(s=>s.cycleTeamFilter);
 const visible=useScoreboardVisible();
 const [selectedId,setSelectedId]=useState<string|null>(null);
 const [inspect,setInspect]=useState(false);
 const panel=useRef<HTMLElement>(null), back=useRef<HTMLButtonElement>(null);
 const selectPlayer=useCallback((id:string)=>{setSelectedId(id);setInspect(true);},[]);
 const backToList=useCallback(()=>{
  setInspect(false);
  requestAnimationFrame(()=>panel.current?.querySelector<HTMLElement>('[data-result-player][aria-pressed="true"]')?.focus());
 },[]);
 useEffect(()=>{if(!visible)setInspect(false);},[visible]);
 useEffect(()=>{if(inspect && back.current?.offsetWidth)back.current.focus();},[inspect]);

 const session=useMotionView(boardSession);
 const [data,setData]=useState<BoardData|null>(null);
 useEffect(()=>{
  const reset=()=>close(),hidden=()=>{if(document.visibilityState==='hidden')reset();};
  const stopUI=useUIStore.subscribe((state,previous)=>{if(state.screen!==previous.screen||state.overlay!==previous.overlay||state.isModeLoading)reset();});
  const stopNetwork=useMotionView.subscribe((state,previous)=>{
   const board=useScoreboardStore.getState();
   if ((board.held || board.pinned) && (!state.connected || boardSession(state)!==boardSession(previous))) reset();
  });
  window.addEventListener('blur',reset);document.addEventListener('visibilitychange',hidden);
  return()=>{stopUI();stopNetwork();window.removeEventListener('blur',reset);document.removeEventListener('visibilitychange',hidden);close();};
 },[close]);
 useEffect(()=>{
  if(!visible)return;
  const update=()=>{
   const next=readBoard();
   setData(previous=>{
    if(!previous||previous.session!==next.session)return next;
    next.players=retainScoreboardPlayers(previous.players,next.players);
    return shallow(previous,next)?previous:next;
   });
  };
  update();const timer=window.setInterval(update,250);
  const escape=(event:KeyboardEvent)=>{if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();if(back.current?.offsetWidth)backToList();else close();}};
  const changeView=(event:KeyboardEvent)=>{
   if(isTypingTarget(event.target)||event.ctrlKey||event.altKey||event.metaKey)return;
   if(event.code==='PageUp'||event.code==='PageDown'){event.preventDefault();event.stopImmediatePropagation();setView(event.code==='PageUp'?'composition':'table');}
   else if(useScoreboardStore.getState().view==='composition'&&['Digit1','Digit3','Numpad1','Numpad3'].includes(event.code)){event.preventDefault();event.stopImmediatePropagation();cycleTeamFilter(event.code.endsWith('1')?-1:1);}
  };
  window.addEventListener('keydown',escape,true);window.addEventListener('keydown',changeView,true);
  return()=>{window.clearInterval(timer);window.removeEventListener('keydown',escape,true);window.removeEventListener('keydown',changeView,true);};
 },[visible,session,close,setView,cycleTeamFilter,backToList]);
 if(!visible)return null;
 const rows=data?.session===session?data.players:[];
 const shownRows=view==='composition'&&teamFilter!=='all'?rows.filter(player=>player.team===teamFilter):rows;
 const selected=shownRows.find(player=>player.id===selectedId)??shownRows.find(player=>player.self)??shownRows[0]??null;
 return <section ref={panel} className="match-scoreboard" data-inspecting={inspect} style={{"--team-size":data?.teamSize??5} as CSSProperties} role="dialog" aria-modal="false" aria-label="Player statistics" onPointerDown={event=>event.stopPropagation()}>
  <header className="match-scoreboard-header"><div><small>{data?.mode??'SESSION'}</small><h2>{view==='composition'?'TEAM COMPOSITION':'PLAYER STATISTICS'}</h2></div>
   <div className="match-scoreboard-tools">{onAbilities&&!staging&&<button type="button" className="menu-control" onClick={()=>{close();onAbilities();}}>HERO ABILITIES</button>}<ControllerAction button="B" className="menu-control" aria-label="Close player statistics" onClick={close}>CLOSE</ControllerAction></div>
  </header>
  <div className="scoreboard-toolbar"><div className="match-scoreboard-status" role="status">{staging?'PRE-MATCH ROSTER':data?.stale?'SNAPSHOT STALE · LAST CONFIRMED TOTALS':'LIVE SESSION TOTALS'}<span>LEVEL IS PROFILE PROGRESSION · MMR PENDING</span></div>
  <MatchViewTabs view={view} onChange={setView}/></div>
  {view==='composition'&&<MatchTeamFilterTabs filter={teamFilter} onChange={setTeamFilter}/>}
  <div className="match-scoreboard-body" data-view={view}>
   <div className="match-scoreboard-main">{view==='composition'?<MatchTeamComposition teamSize={data?.teamSize} players={rows} teamFilter={teamFilter} selectedId={selected?.id} onSelect={selectPlayer}/>:<MatchStatsTable teamSize={data?.teamSize} players={rows} selectedId={selected?.id} onSelect={selectPlayer}/>}</div>
   <div className="scoreboard-inspector"><button ref={back} className="scoreboard-back" aria-label="Back to player list" onClick={backToList}>← PLAYER LIST</button><MatchPlayerDetails player={selected}/></div>
  </div>
  <footer className="match-scoreboard-footer"><span><ControlGlyph controller={["LB","RB"]} keyboard="PgUp / PgDn"/> TEAM / STATS</span><span>HEALING INCLUDES SELF · — MEANS UNAVAILABLE</span></footer>
 </section>;
}
