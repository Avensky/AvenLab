import { useCabinTime } from "../../store/cabinClock";
import { useNetworkStore } from "../../store/networkStore";

export function CabinClock() { return <time className="cabin-clock">{useCabinTime()}</time>; }
export function GearClock({ lit }: { lit: boolean }) {
  const time = useCabinTime();
  return <text x="84" y="173" className="gauge-lcd-clock" aria-label="Local time">{lit ? time : ""}</text>;
}
// A competitive server can publish this clock later. No local countdown invents
// a match start/end, winner, or sudden-death rule in today's sandbox.
export function MatchClock() {
  const remaining = useNetworkStore(s => {
    const value=s.snapshot?.match_clock?.remaining_s;
    return value!==undefined&&Number.isFinite(value)?Math.max(0,Math.ceil(value)):null;
  });
  const phase = useNetworkStore(s => s.snapshot?.match_clock?.phase);
  if (remaining === null || !Number.isFinite(remaining)) return null;
  const seconds = Math.max(0, Math.ceil(remaining));
  return <time className="match-clock" data-phase={phase} aria-label="Server match clock">{phase === "overtime" ? "OVERTIME" : `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`}</time>;
}
