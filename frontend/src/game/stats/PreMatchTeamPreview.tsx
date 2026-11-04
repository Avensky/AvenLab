import {useMemo,useState} from 'react';
import type {SocialView} from '../../store/social/socialStore';
import type {MatchView} from '../../store/hud/scoreboardStore';
import {MatchTeamComposition,MatchStatsTable,MatchViewTabs} from './MatchPresentation';
import {preMatchPlayers} from './scoreboardData';

/** Read-only admission preview; hero selection and deployment keep their own
 * server-validated action. Both views are available before a body is spawned, scoped to the local team. */
export function PreMatchTeamPreview({view}:{view:SocialView|null}){
 const [tab,setTab]=useState<MatchView>('composition');
 const [selectedId,setSelectedId]=useState<string|null>(null);
 const team=view?.alpha?.active?.team;
 const ownTeam=team==='red'||team==='blue'?team:null;
 const players=useMemo(()=>preMatchPlayers(view).filter(player=>ownTeam!==null&&player.team===ownTeam),[view,ownTeam]);
 return <section className="prematch-team-preview" aria-label="Pre-deployment match preview" data-match-preview>
  <header><span>{ownTeam?`${ownTeam.toUpperCase()} TEAM`:'TEAM PREVIEW'} <small>YOUR STYLES · CONFIRMED PICKS</small></span><MatchViewTabs view={tab} onChange={setTab}/></header>
  <div className="prematch-preview-content">{ownTeam?(tab==='composition'?<MatchTeamComposition players={players} compact teamFilter={ownTeam} selectedId={selectedId??players.find(player=>player.self)?.id} onSelect={setSelectedId}/>:<MatchStatsTable players={players} compact teamFilter={ownTeam}/>):<p className="scoreboard-team-empty">Waiting for your confirmed team.</p>}</div>
 </section>;
}
