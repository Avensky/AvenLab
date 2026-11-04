import {useNetworkStore} from '../../store/session/networkStore';
import './ctfMatch.css';

export function CtfMatchHUD(){
 const match=useNetworkStore(s=>s.snapshot?.match_state),id=useNetworkStore(s=>s.playerId);
 if(!match)return null;
 const clock=Math.ceil(Math.max(0,match.remaining_s));
 const carrying=match.flags.some(flag=>flag.carrier===id);
 const flagText=match.flags.map(flag=>`${flag.team.toUpperCase()} FLAG ${flag.status==='dropped'?'DROPPED · TOUCH TO RETURN':flag.status.toUpperCase()}`).join(' · ');
 return <aside className="ctf-match-hud" aria-label="Capture the flag match status">
  <div className="ctf-score-line"><strong data-team="blue">BLUE {match.scores.blue}</strong><span>{match.phase==='ended'?(match.winner?`${match.winner.toUpperCase()} WINS`:'DRAW'):match.phase==='waiting'?'WAITING FOR TEAMS':`${Math.floor(clock/60)}:${String(clock%60).padStart(2,'0')}`}</span><strong data-team="red">{match.scores.red} RED</strong></div>
  <small>{match.training?'TRAINING · NO XP · ':''}FIRST TO {match.captures_to_win}{carrying?' · CARRYING FLAG · SPEED −20% · DAMAGE TAKEN +20%':''}</small>
  <span className="ctf-flag-status" aria-label={flagText}>{flagText}</span>
 </aside>;
}
