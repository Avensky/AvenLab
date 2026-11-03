import { HEROES, type AlphaView, type HeroRole, type PlayMode } from "../../store/alpha/alphaStore";

/** Mirror Rust policy::role_fits; Rust still validates every submitted pick.
 * Exclude our old pick so replacing it cannot consume two role slots. */
export function unavailableHeroes(alpha: AlphaView | undefined, mode: PlayMode, owner: string | undefined): Record<string, string> {
  if (!alpha?.active || alpha.role_limits === false || !["quickplay", "competitive"].includes(mode) || alpha.active.mode !== mode) return {};
  const counts: Record<HeroRole, number> = { tank: 0, dps: 0, support: 0 };
  for (const member of alpha.roster) {
    if (member.id === owner || member.team !== alpha.active.team || member.mode !== mode || (member.world_id !== undefined && member.world_id !== alpha.active.world_id)) continue;
    const hero = HEROES.find(h => h.id === member.hero);
    if (hero) counts[hero.role]++;
  }
  const result: Record<string, string> = {};
  for (const hero of HEROES) {
    const c = { ...counts, [hero.role]: counts[hero.role] + 1 };
    const total = c.tank + c.dps + c.support;
    const required = Math.max(0, 1 - c.tank) + Math.max(0, 2 - c.dps) + Math.max(0, 1 - c.support);
    if (total > 5 || c.tank > 1 || c.dps > 3 || c.support > 2 || required > 5 - total) result[hero.id] = `${hero.role.toUpperCase()} full · team composition limit`;
  }
  return result;
}
