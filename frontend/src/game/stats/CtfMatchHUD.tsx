import { useEffect } from "react";
import { useNetworkStore } from "../../store/session/networkStore";
import { useCtfFeedbackStore } from "./ctfFeedbackStore";
import { getCtfCaptureObjective } from "./ctfObjective";
import "./ctfMatch.css";

export function CtfMatchHUD() {
  const snapshot = useNetworkStore((s) => s.snapshot), id = useNetworkStore((s) => s.playerId);
  const capture = useCtfFeedbackStore((s) => s.capture);
  useEffect(() => {
    if (!capture) return;
    const timeout = setTimeout(() => {
      if (useCtfFeedbackStore.getState().capture?.id === capture.id) useCtfFeedbackStore.setState({ capture: null });
    }, Math.max(0, 3500 - (performance.now() - capture.at)));
    return () => clearTimeout(timeout);
  }, [capture]);
  const match = snapshot?.match_state;
  if (!match) return null;
  const me = snapshot.entities.find((entity) => entity.id === id);
  const objective = getCtfCaptureObjective(match, me);
  const clock = Math.ceil(Math.max(0, match.remaining_s));
  const confirmed = Boolean(capture);
  const cue = confirmed ? "CAPTURE CONFIRMED · +1" : !objective?.atBase ? null : objective.state === "warmup" ? "WARMUP · NO SCORING" : objective.state === "blocked" ? "CAPTURE BLOCKED · RETURN OUR FLAG" : "HOME BASE · AWAITING CAPTURE CONFIRMATION";
  return <aside className="ctf-match-hud" aria-label="Capture the flag match status">
    <div className="ctf-score-line"><strong data-team="blue">BLUE {match.scores.blue} <span className="ctf-team-indicator" role="img" aria-label="Your team">●</span></strong><span>{match.phase === "ended" ? (match.winner ? `${match.winner.toUpperCase()} WINS` : "DRAW") : match.phase === "waiting" ? "WAITING FOR TEAMS" : `${Math.floor(clock / 60)}:${String(clock % 60).padStart(2, "0")}`}</span><strong data-team="red"><span className="ctf-team-indicator" role="img" aria-label="Your team">●</span> {match.scores.red} RED</strong></div>
    <small>{match.training ? "TRAINING · NO XP · " : ""}FIRST TO {match.captures_to_win}</small>
    {cue && <div className="ctf-capture-cue" data-state={confirmed ? "confirmed" : objective?.state} role="status" aria-live="polite"><span aria-hidden="true">⚑</span><span>{cue}</span></div>}
  </aside>;
}
