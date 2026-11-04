import { useShallow } from "zustand/react/shallow";
import { useEffect } from "react";
import { useNetworkStore } from "../../store/session/networkStore";
import { useCtfFeedbackStore } from "./ctfFeedbackStore";
import { getCtfCaptureObjective } from "./ctfObjective";
import "./ctfMatch.css";

export function CtfMatchHUD() {
  const display = useNetworkStore(useShallow(s => {
    const match = s.snapshot?.match_state;
    if (!match) return null;
    const objective = getCtfCaptureObjective(match, s.getMe() ?? undefined);
    return { blue: match.scores.blue, red: match.scores.red, phase: match.phase,
      winner: match.winner, training: match.training, clock: Math.ceil(Math.max(0, match.remaining_s)),
      atBase: objective?.atBase ? objective.state : null };
  }));
  const capture = useCtfFeedbackStore((s) => s.capture);
  useEffect(() => {
    if (!capture) return;
    const timeout = setTimeout(() => {
      if (useCtfFeedbackStore.getState().capture?.id === capture.id) useCtfFeedbackStore.setState({ capture: null });
    }, Math.max(0, 3500 - (performance.now() - capture.at)));
    return () => clearTimeout(timeout);
  }, [capture]);
  if (!display) return null;
  const { clock, phase, winner, training, atBase } = display;
  const confirmed = Boolean(capture);
  const cue = confirmed ? "CAPTURE CONFIRMED · +1" : !atBase ? null : atBase === "warmup" ? "WARMUP · NO SCORING" : atBase === "blocked" ? "CAPTURE BLOCKED · RETURN OUR FLAG" : "HOME BASE · AWAITING CAPTURE CONFIRMATION";
  return <aside className="ctf-match-hud" aria-label="Capture the flag match status">
    <div className="ctf-score-line"><strong data-team="blue">BLUE {display.blue} <span className="ctf-team-indicator" role="img" aria-label="Your team">●</span></strong><span>{phase === "ended" ? (winner ? `${winner.toUpperCase()} WINS` : "DRAW") : phase === "waiting" ? "WAITING FOR TEAMS" : `${Math.floor(clock / 60)}:${String(clock % 60).padStart(2, "0")}`}</span><strong data-team="red"><span className="ctf-team-indicator" role="img" aria-label="Your team">●</span> {display.red} RED</strong></div>
    <small>{training ? "TRAINING · NO XP · " : ""}CAPTURE THE FLAG</small>
    {cue && <div className="ctf-capture-cue" data-state={confirmed ? "confirmed" : atBase ?? undefined} role="status" aria-live="polite"><span aria-hidden="true">⚑</span><span>{cue}</span></div>}
  </aside>;
}
