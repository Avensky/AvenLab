import {memo} from 'react';
import {HEROES} from '../../store/alpha/alphaStore';
import {MATCH_TEAM_FILTERS,type MatchView,type MatchTeamFilter} from '../../store/hud/scoreboardStore';
import {ControllerButton} from '../../components/controller';
import {HeroPortrait} from '../alpha/HeroPortrait';
import {formatStat,killDeathRatio,type ScoreboardPlayer} from './scoreboardData';
import './matchScoreboard.css';

type PresentationProps={players:ScoreboardPlayer[];selectedId?:string|null;onSelect?:(id:string)=>void;compact?:boolean;teamFilter?:MatchTeamFilter;teamSize?:3|5};
const sides=['red','blue',null] as const;
const label=(side:ScoreboardPlayer['team'])=>side?`${side.toUpperCase()} TEAM`:'UNASSIGNED';
function playerStatus(player:ScoreboardPlayer){
 if(player.heroHidden)return 'HIDDEN UNTIL MATCH START';
 if(player.status)return {selecting:'CHOOSING',ready:'HERO SELECTED',active:'DEPLOYED',defeated:'DEFEATED',reconnecting:'RECONNECTING',completed:'MATCH COMPLETE'}[player.status];
 return player.waiting?'AWAITING VEHICLE':player.defeated?'DEFEATED':'DEPLOYED';
}
export function MatchViewTabs({view,onChange,integrated=false,panelId}:{view:MatchView;onChange:(view:MatchView)=>void;integrated?:boolean;panelId?:string}){
 return <nav className="match-view-tabs" role="tablist" aria-label="Match view" data-controller-row={integrated?undefined:true}>
  {(['composition','table'] as const).map((item,index)=><button key={item} type="button" role="tab" className="menu-control" aria-selected={view===item} aria-controls={panelId} data-match-view={item} onClick={()=>onChange(item)} onKeyDown={event=>{
   if(event.key==='ArrowLeft'||event.key==='ArrowRight'){event.preventDefault();event.stopPropagation();const next=item==='table'?'composition':'table';onChange(next);event.currentTarget.parentElement?.querySelector<HTMLButtonElement>(`[data-match-view="${next}"]`)?.focus();}
  }}><span aria-hidden="true">{index===0?'◫':'▤'}</span>{index===0?'TEAM':'STATS'}</button>)}
 </nav>;
}

/** LT/RT is the secondary tab row; TEAM/STATS retains LB/RB ownership. */
export function MatchTeamFilterTabs({filter,onChange}:{filter:MatchTeamFilter;onChange:(filter:MatchTeamFilter)=>void}){
 return <nav className="match-team-filter-tabs" role="tablist" aria-label="Team composition filter" data-controller-row>
  <span aria-hidden="true"><ControllerButton button="LT"/></span>
  {MATCH_TEAM_FILTERS.map((team,index)=><button key={team} type="button" role="tab" className="menu-control" aria-selected={filter===team} data-team-filter={team} onClick={()=>onChange(team)} onKeyDown={event=>{
   if(event.key==='ArrowLeft'||event.key==='ArrowRight'){event.preventDefault();event.stopPropagation();const next=MATCH_TEAM_FILTERS[(index+(event.key==='ArrowLeft'?-1:1)+MATCH_TEAM_FILTERS.length)%MATCH_TEAM_FILTERS.length];onChange(next);event.currentTarget.parentElement?.querySelector<HTMLButtonElement>(`[data-team-filter="${next}"]`)?.focus();}
  }}>{team==='all'?'VIEW ALL':`${team.toUpperCase()} TEAM`}</button>)}
  <span aria-hidden="true"><ControllerButton button="RT"/></span>
 </nav>;
}

/** Pure presentation: live admissions and saved results supply the same rows.
 * A portrait click inspects a player; it cannot change a hero or team. */
export const MatchTeamComposition=memo(function MatchTeamComposition({players,selectedId,onSelect,compact=false,teamFilter='all',teamSize=5}:PresentationProps){
 return <div className="match-team-composition" data-compact={compact}>
  {sides.filter(side=>teamFilter==='all'||side===teamFilter).map(side=>{
   const rows=players.filter(player=>player.team===side).slice(0,side===null?teamSize*2:teamSize);
   if(side===null&&!rows.length)return null;
   const slots=side===null?rows:Array.from({length:teamSize},(_,index)=>rows[index]);
   return <section className="scoreboard-team match-composition-team" data-team={side??'unknown'} key={side??'unknown'} aria-label={`${label(side)} composition`}>
    <h3>{label(side)}<span>{rows.length}{side===null?'':` / ${teamSize}`}</span></h3>
    <div className="match-composition-row" data-controller-row data-controller-columns={compact?teamSize:2} style={compact?{gridTemplateColumns:`repeat(${teamSize},minmax(132px,1fr))`,minWidth:teamSize*132+(teamSize-1)*4}:undefined}>
     {slots.map((player,index)=>{
      if(!player)return <div className="match-composition-seat match-composition-empty" key={`open:${index}`} aria-label={`${label(side)} open slot`}><span aria-hidden="true">+</span><strong>OPEN SLOT</strong></div>;
      const hero=HEROES.find(hero=>hero.id===player.hero),heroLabel=player.heroHidden?'MYSTERY HERO':hero?.name??'AWAITING HERO';
      const content=<><div className="match-composition-art"><HeroPortrait hero={player.hero} appearance={player.appearance}/><span className="match-player-level" title="Confirmed profile level">{player.level===null?'LV —':`LV ${formatStat(player.level)}`}</span>{player.self&&<span className="match-player-you">YOU</span>}</div><div className="match-composition-info"><strong>{player.name}</strong><small>{heroLabel}</small><span className="match-composition-role">{player.heroHidden?'?':hero?.role.toUpperCase()??'—'}</span><span className="match-player-status">{playerStatus(player)}</span></div></>;
      const props={className:'match-composition-seat','data-player-id':player.id,'data-result-player':onSelect?player.id:undefined,'data-self':player.self,'data-status':player.heroHidden?'mystery':player.status??(player.defeated?'defeated':'active'),'data-selected':player.id===selectedId,'aria-label':`${player.name} · ${heroLabel} · ${playerStatus(player)}`};
      return onSelect?<button {...props} type="button" key={player.id} aria-pressed={player.id===selectedId} onClick={()=>onSelect(player.id)} onFocus={event=>event.currentTarget.scrollIntoView?.({block:'nearest',inline:'nearest'})}>{content}</button>:<article {...props} key={player.id}>{content}</article>;
     })}
    </div>
   </section>;
  })}
 </div>;
});

export const MatchStatsTable=memo(function MatchStatsTable({players,selectedId,onSelect,compact=false,teamFilter='all',teamSize=5}:PresentationProps){
 return <div className="match-stats-table" data-compact={compact}>
  {sides.filter(side=>teamFilter==='all'||side===teamFilter).map(side=>{
   const rows=players.filter(player=>player.team===side).slice(0,side===null?teamSize*2:teamSize);
   if(side===null&&!rows.length)return null;
   return <section className="scoreboard-team" data-team={side??'unknown'} key={side??'unknown'} aria-label={`${label(side)} statistics`}>
    <h3>{label(side)}<span>{rows.length} PLAYER{rows.length===1?'':'S'}</span></h3>
    <table><thead><tr><th scope="col">PLAYER / VEHICLE</th><th scope="col" title="Killing blows">K</th><th scope="col" title="Kill assists">A</th><th scope="col" title="Deaths">D</th><th scope="col">DAMAGE</th><th scope="col">HEALING</th></tr></thead>
     <tbody>{rows.map(player=>{const hero=HEROES.find(hero=>hero.id===player.hero),identity=<><HeroPortrait hero={player.hero} appearance={player.appearance} className="scoreboard-table-portrait"/><span><strong>{player.name}{player.self&&<em>YOU</em>}</strong><small>{player.heroHidden?'MYSTERY HERO':hero?.name??'VEHICLE'} · {playerStatus(player)}</small></span></>;
      return <tr key={player.id} data-player-id={player.id} data-self={player.self} data-selected={selectedId===player.id} data-status={player.status}>
       <th scope="row">{onSelect?<button type="button" className="scoreboard-table-player" data-result-player={player.id} aria-label={`View ${player.name} statistics`} aria-pressed={selectedId===player.id} onClick={()=>onSelect(player.id)}>{identity}</button>:<div className="scoreboard-table-player">{identity}</div>}</th>
       <td>{formatStat(player.kills)}</td><td>{formatStat(player.stats?.assists??null)}</td><td>{formatStat(player.deaths)}</td><td>{formatStat(player.stats?.damage_dealt??null)}</td><td>{formatStat(player.stats?.healing_done??null)}</td>
      </tr>;
     })}{!rows.length&&<tr><td colSpan={6} className="scoreboard-team-empty">No confirmed players</td></tr>}</tbody>
    </table>
   </section>;
  })}
 </div>;
});
function Stat({label,value,pending=false,title}:{label:string;value:string;pending?:boolean;title?:string}){
 return <div className="scoreboard-stat" data-pending={pending} title={title}><dt>{label}</dt><dd>{value}{pending&&<small>PENDING</small>}</dd></div>;
}
export const MatchPlayerDetails=memo(function MatchPlayerDetails({player}:{player:ScoreboardPlayer|null}){
 if(!player)return <aside className="scoreboard-player-details scoreboard-team-empty">Select a player to inspect confirmed totals.</aside>;
 const hero=HEROES.find(hero=>hero.id===player.hero),stats=player.stats;
 const streaks=stats as (typeof stats&{current_kill_streak?:number;best_kill_streak?:number});
 return <article className="scoreboard-player-card scoreboard-player-details" data-team={player.team??'unknown'} data-self={player.self} aria-label={`${player.name}${player.self?' · You':''} statistics`}>
  <div className="scoreboard-player-identity"><HeroPortrait hero={player.hero} appearance={player.appearance} className="scoreboard-player-portrait"/><div><h3>{player.name}{player.self&&<span>YOU</span>}</h3><p>{player.heroHidden?'MYSTERY HERO':hero?.name??'VEHICLE'} · {player.heroHidden?'?':hero?.role.toUpperCase()??'—'}</p><p>{playerStatus(player)}</p></div><div className="scoreboard-level"><small>LEVEL</small><strong>{formatStat(player.level)}</strong></div></div>
  <dl className="scoreboard-player-stats">
   <Stat label="KILLING BLOWS" value={formatStat(player.kills)} title="Final lethal hits confirmed by the server."/>
   <Stat label="DEATHS" value={formatStat(player.deaths)}/>
   <Stat label="K / D" value={killDeathRatio(player.kills,player.deaths)}/>
   <Stat label="ASSISTS" value={formatStat(stats?.assists??null)}/>
   <Stat label="DAMAGE DONE" value={formatStat(stats?.damage_dealt??null)} title="Actual enemy HP removed; excludes overkill and protected hits."/>
   <Stat label="HEALING DONE" value={formatStat(stats?.healing_done??null)} title="Actual HP restored, including self-healing. Overhealing does not count."/>
   <Stat label="SELF HEALING" value={formatStat(stats?.self_healing??null)} title="Part of healing done, never added twice."/>
   <Stat label="GAS BURNED" value={stats?`${formatStat(stats.gas_burned_liters,1)} L`:'—'}/>
   <Stat label="GAS GAINED" value={stats?`${formatStat(stats.gas_gained_liters,1)} L`:'—'}/>
   <Stat label="BEST STREAK" value={formatStat(streaks?.best_kill_streak??null)}/>
   <Stat label="CURRENT STREAK" value={formatStat(streaks?.current_kill_streak??null)}/>
   <Stat label="RESPAWNS" value={formatStat(stats?.respawns??null)}/>
   <Stat label="RESURRECTIONS" value={formatStat(stats?.resurrections??null)} title="Combat revivals performed by this player. Fuel-only recovery and ordinary respawns are counted separately."/>
   <Stat label="MMR" value="—" pending title="Ranked matchmaking rating is not calculated by this alpha."/>
  </dl>
 </article>;
});
