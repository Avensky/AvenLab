import type { CtfFlag, CtfFlagEvent, CtfMatchState } from "../../store/session/networkStore";
import type { MissionRadioNotice } from "../../store/missions/missionRadioStore";

export type ObservedFlagEvent = CtfFlagEvent & { id: string; warmup: boolean };
const otherTeam = (team: "red" | "blue") => team === "red" ? "blue" : "red";

type FlagHistory = {
  phase: CtfMatchState["phase"];
  scores: CtfMatchState["scores"];
  flags: Pick<CtfFlag, "team" | "status" | "carrier">[];
};

// Older servers omit event sequences. Keep just the fields needed to infer
// their next transition, and copy only when one of those fields changes.
function rememberFlags(previous: FlagHistory | null, match: CtfMatchState): FlagHistory {
  if (previous && previous.phase === match.phase &&
      previous.scores.red === match.scores.red && previous.scores.blue === match.scores.blue &&
      previous.flags.length === match.flags.length && match.flags.every((flag, i) => {
        const old = previous.flags[i];
        return old.team === flag.team && old.status === flag.status && old.carrier === flag.carrier;
      })) return previous;
  return {
    phase: match.phase, scores: { ...match.scores },
    flags: match.flags.map(({team, status, carrier}) => ({team, status, carrier})),
  };
}

/** A new world/round is a baseline, never a replay. Server sequence IDs also
 * preserve fast pickup/drop/return events that occur between snapshot packets. */
export function createCtfEventObserver() {
  let context: string | null = null, lastTick = -1, lastSeq = 0;
  let previous: FlagHistory | null = null;
  return (key: string | null, match: CtfMatchState | null | undefined, tick: number): ObservedFlagEvent[] => {
    if (!key || !match) { context = null; previous = null; lastTick = -1; lastSeq = 0; return []; }
    if (key !== context) {
      context = key;
      previous = rememberFlags(null, match);
      lastTick = tick;
      lastSeq = (match.events ?? []).reduce((highest, event) =>
        Number.isSafeInteger(event.seq) ? Math.max(highest, event.seq) : highest, 0);
      return [];
    }
    if (!Number.isFinite(tick) || tick <= lastTick) return [];
    const events: CtfFlagEvent[] = [];
    if (Array.isArray(match.events)) {
      // Most snapshots repeat the same bounded event history.
      if (match.events.some(event => event.seq > lastSeq)) {
        const fresh = match.events.filter(event => event.seq > lastSeq).sort((a, b) => a.seq - b.seq);
        for (const event of fresh) {
          if (Number.isSafeInteger(event.seq) && event.seq > lastSeq && ["picked_up", "dropped", "returned", "captured"].includes(event.kind) && ["red", "blue"].includes(event.flag_team)) {
            events.push(event);
            lastSeq = event.seq;
          }
        }
      }
    } else if (previous && !(previous.phase === "waiting" && match.phase !== "waiting") && !(previous.phase === "ended" && match.phase !== "ended")) {
      // Compatibility for the preceding snapshot contract. Score deltas take
      // priority over a carried flag returning home; never call that a return.
      const captured = new Set<"red" | "blue">();
      for (const team of ["red", "blue"] as const) {
        if (match.scores[team] > previous.scores[team]) {
          const flagTeam = otherTeam(team);
          captured.add(flagTeam);
          events.push({ seq: ++lastSeq, kind: "captured", flag_team: flagTeam, player_id: previous.flags.find((flag) => flag.team === flagTeam)?.carrier ?? null, elapsed_s: match.elapsed_s });
        }
      }
      for (const flag of match.flags) {
        const old = previous.flags.find((value) => value.team === flag.team);
        if (!old || captured.has(flag.team)) continue;
        const kind = flag.status === "carried" && (old.status !== "carried" || old.carrier !== flag.carrier) ? "picked_up" : flag.status === "dropped" && old.status === "carried" ? "dropped" : flag.status === "home" && old.status !== "home" ? "returned" : null;
        if (kind) events.push({ seq: ++lastSeq, kind, flag_team: flag.team, player_id: flag.carrier ?? old.carrier, elapsed_s: match.elapsed_s });
      }
    }
    previous = rememberFlags(previous, match);
    lastTick = tick;
    return events.map((event) => ({ ...event, id: `ctf:${key}:${event.seq}`, warmup: match.phase === "waiting" }));
  };
}

export function flagEventNotice(event: ObservedFlagEvent, playerId: string): MissionRadioNotice {
  const flag = `${event.flag_team.toUpperCase()} FLAG`;
  const actor = event.player_id === playerId ? "You" : "A player";
  const title = event.kind === "picked_up" ? `${flag} PICKED UP` : event.kind === "dropped" ? `${flag} DROPPED` : event.kind === "returned" ? `${flag} RETURNED` : `${otherTeam(event.flag_team).toUpperCase()} CAPTURE CONFIRMED`;
  const message = event.kind === "picked_up" ? `${actor} picked up the ${event.flag_team} flag. Bring it to your home base while your own flag is home.` : event.kind === "dropped" ? `The ${event.flag_team} flag is on the ground. Touch it within 10 seconds to recover or steal it before it returns home.` : event.kind === "returned" ? `The ${event.flag_team} flag is back at its home base.` : `${otherTeam(event.flag_team).toUpperCase()} delivered the enemy flag home. The server confirmed the capture.`;
  return { id: event.id, title, message: `${event.warmup ? "WARMUP · No scoring. " : ""}${message}`, kind: "update", source: "ctf" };
}
