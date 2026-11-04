import type { CtfMatchState, PhysicsEntitySnapshot } from "../../store/session/networkStore";

/** Match the server's capture cylinder. This only explains the objective;
 * a score is displayed as confirmed only after an accepted server event. */
export function getCtfCaptureObjective(match: CtfMatchState, me: PhysicsEntitySnapshot | undefined) {
  const team = me?.team;
  if (team !== "red" && team !== "blue") return null;
  const ownFlag = match.flags.find((flag) => flag.team === team);
  const enemyFlag = match.flags.find((flag) => flag.team !== team);
  if (!ownFlag || !enemyFlag || enemyFlag.carrier !== me?.id || me.health?.defeated || match.phase === "ended") return null;
  const dx = me.position[0] - ownFlag.base[0], dz = me.position[2] - ownFlag.base[2];
  const distance = Math.hypot(dx, dz);
  const atBase = distance <= 3 && Math.abs(me.position[1] - ownFlag.base[1]) <= 4;
  const state = match.phase === "waiting" ? "warmup" : ownFlag.status !== "home" ? "blocked" : atBase ? "awaiting" : "return_home";
  return { state, atBase, distance, ownFlag, enemyFlag, team } as const;
}
