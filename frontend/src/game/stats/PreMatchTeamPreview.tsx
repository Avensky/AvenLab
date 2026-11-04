import {modeTeamSize} from '../../store/alpha/alphaStore';
import {useId,useMemo,useState} from 'react';
import type {SocialView} from '../../store/social/socialStore';
import {useNetworkStore} from '../../store/session/networkStore';
import {ControllerButton} from '../../components/controller';
import type {MatchView} from '../../store/hud/scoreboardStore';
import {MatchTeamComposition,MatchStatsTable,MatchViewTabs} from './MatchPresentation';
import {preMatchPlayers,preMatchEnemiesRevealed} from './scoreboardData';

/** A compact read-only dock: view/team controls share the content's own frame.
 * Both views reserve one height; choosing a tab cannot shrink the hero picker. */
export function PreMatchTeamPreview({view}:{view:SocialView|null}){
 const [tab,setTab]=useState<MatchView>('composition'),[collapsed,setCollapsed]=useState(false);
 const [selectedId,setSelectedId]=useState<string|null>(null);
 const [choice,setChoice]=useState<{context:string;team:'red'|'blue'}|null>(null);
 const connected=useNetworkStore(state=>state.connected),panelId=useId();
 const active=view?.alpha?.active,team=active?.team;
 const teamSize=modeTeamSize(active?.mode??'',active?.team_size);
 const ownTeam=team==='red'||team==='blue'?team:null;
 const context=`${active?.world_id??''}:${active?.match_id??''}:${ownTeam??''}`;
 const selectedTeam=choice?.context===context?choice.team:ownTeam;
 const revealEnemies=preMatchEnemiesRevealed(view,connected);
 const players=useMemo(()=>preMatchPlayers(view,revealEnemies),[view,revealEnemies]);
 const chooseView=(next:MatchView)=>{setTab(next);setCollapsed(false);};
 const chooseTeam=(next:'red'|'blue')=>{setChoice({context,team:next});setCollapsed(false);};
 return <section className="prematch-team-preview" aria-label="Pre-deployment match preview" data-match-preview data-collapsed={collapsed} data-view={tab} data-team-size={teamSize}>
  <header className="prematch-preview-toolbar" data-controller-row data-controller-columns="5">
   <MatchViewTabs view={tab} onChange={chooseView} integrated panelId={panelId}/>
   <nav className="prematch-team-tabs" role="tablist" aria-label="Preview team">
    <span className="prematch-team-trigger" aria-hidden="true"><ControllerButton button="LT"/></span>
    {(['red','blue'] as const).map(entry=><button key={entry} type="button" role="tab" className="menu-control" data-prematch-team={entry} data-your-team={entry===ownTeam} aria-label={`${entry==='red'?'Red':'Blue'} team`} aria-selected={entry===selectedTeam} aria-controls={panelId} disabled={!ownTeam} title={entry===ownTeam?'Your team':'Opposing heroes stay hidden until match start'} onClick={()=>chooseTeam(entry)} onKeyDown={event=>{
     if(event.key==='ArrowLeft'||event.key==='ArrowRight'){event.preventDefault();event.stopPropagation();const next=entry==='red'?'blue':'red';chooseTeam(next);event.currentTarget.parentElement?.querySelector<HTMLButtonElement>(`[data-prematch-team="${next}"]`)?.focus();}
    }}><i aria-hidden="true"/>{entry.toUpperCase()}<span className="prematch-own-team" aria-hidden="true">{entry===ownTeam?' · YOU':''}</span></button>)}
    <span className="prematch-team-trigger" aria-hidden="true"><ControllerButton button="RT"/></span>
   </nav>
   <button type="button" className="menu-control prematch-preview-collapse" aria-label={collapsed?'Expand team preview':'Collapse team preview'} aria-expanded={!collapsed} aria-controls={panelId} onClick={()=>setCollapsed(current=>!current)}><span aria-hidden="true">{collapsed?'⌃':'⌄'}</span></button>
  </header>
  <div id={panelId} className="prematch-preview-content" data-prematch-viewport role="tabpanel" aria-label={`${selectedTeam?.toUpperCase()??'CONFIRMED'} team ${tab==='composition'?'heroes':'statistics'}`} hidden={collapsed}>
   {ownTeam&&selectedTeam?(tab==='composition'?<MatchTeamComposition players={players} teamSize={teamSize} compact teamFilter={selectedTeam} selectedId={selectedId??players.find(player=>player.self)?.id} onSelect={setSelectedId}/>:<MatchStatsTable players={players} teamSize={teamSize} compact teamFilter={selectedTeam}/>):<p className="scoreboard-team-empty">Waiting for your confirmed team.</p>}
  </div>
 </section>;
}
