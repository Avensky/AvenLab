import { HEROES, canonicalGameMode, isMatchMode, modeTeamSize, type AlphaView, type HeroRole, type PlayMode } from "../../store/alpha/alphaStore";

/** Mirror Rust policy::role_fits; Rust still validates every submitted pick.
 * Exclude our old pick so replacing it cannot consume two role slots. */
export function unavailableHeroes(alpha: AlphaView | undefined, mode: PlayMode, owner: string | undefined): Record<string, string> {
  if (!alpha?.active || alpha.role_limits === false || !isMatchMode(mode) || canonicalGameMode(alpha.active.mode) !== canonicalGameMode(mode)) return {};
  const teamSize = modeTeamSize(alpha.active.mode, alpha.active.team_size);
  const caps = alpha.active.role_caps ?? (teamSize === 3 ? {tank:1,dps:1,support:1} : {tank:1,dps:3,support:2});
  const minimums = alpha.active.role_minimums ?? (teamSize === 3 ? {tank:1,dps:1,support:1} : {tank:1,dps:2,support:1});
  const counts: Record<HeroRole, number> = { tank: 0, dps: 0, support: 0 };
  for (const member of alpha.roster) {
    if (member.id === owner || member.team !== alpha.active.team || canonicalGameMode(member.mode) !== canonicalGameMode(mode) || (member.world_id !== undefined && member.world_id !== alpha.active.world_id)) continue;
    const hero = HEROES.find(h => h.id === member.hero);
    if (hero) counts[hero.role]++;
  }
  const result: Record<string, string> = {};
  for (const hero of HEROES) {
    const c = { ...counts, [hero.role]: counts[hero.role] + 1 };
    const total = c.tank + c.dps + c.support;
    const required = Math.max(0, minimums.tank - c.tank) + Math.max(0, minimums.dps - c.dps) + Math.max(0, minimums.support - c.support);
    if (total > teamSize || c.tank > caps.tank || c.dps > caps.dps || c.support > caps.support || required > teamSize - total) result[hero.id] = `${hero.role.toUpperCase()} full · team composition limit`;
  }
  return result;
}
