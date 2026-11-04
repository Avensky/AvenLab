export type MatchTeam = "red" | "blue";

/** Cosmetic UI state must agree with both the admission and the live world.
 * A stale seat, a practice team, or an unconfirmed preview never recolors HUDs. */
export type MatchTeamContext = {
  screen: string;
  loading: boolean;
  connected: boolean;
  playerId: string;
  roomId: number | null;
  entityId?: string;
  entityRoom?: number;
  entityTeam?: string;
  activeMode?: string;
  activeWorld?: number;
  activeTeam?: string;
  matchMode?: string;
};

export function confirmedMatchTeam(context: MatchTeamContext): MatchTeam | null {
  const {activeMode, activeTeam} = context;
  if (context.screen !== "sandbox" || context.loading || !context.connected ||
      !context.playerId || context.entityId !== context.playerId ||
      !Number.isSafeInteger(context.activeWorld) || (context.activeWorld ?? 0) <= 0 ||
      !["quickplay", "competitive", "skirmish"].includes(activeMode ?? "") ||
      context.matchMode !== activeMode || context.entityRoom !== context.activeWorld ||
      (context.roomId !== null && context.roomId !== context.entityRoom) ||
      context.entityTeam !== activeTeam || (activeTeam !== "red" && activeTeam !== "blue")) return null;
  return activeTeam;
}

export const MATCH_TEAM_COLORS = {
  // Warm red identifies a team; Strawberry retains its separate magenta/pink palette.
  red: {glow: "#ef122c", dark: "#ff6570", light: "#ac132a"},
  blue: {glow: "#4484ff", dark: "#69bbff", light: "#145fa8"},
} as const;

/** Semantic team identities also appear in staging, career and results when no
 * live match accent is active. Keep readable red text separate from red light. */
export function applyTeamIdentityColors(root: HTMLElement, scheme: "dark" | "light") {
  root.style.setProperty("--team-red", MATCH_TEAM_COLORS.red[scheme]);
  root.style.setProperty("--team-red-glow", MATCH_TEAM_COLORS.red.glow);
}

/** App-theme tokens are never replaced. Transient tokens drive explicit team
 * glows only. The app theme owns the cockpit stitching. */
export function applyMatchTeamTheme(root: HTMLElement, team: MatchTeam | null, scheme: "dark" | "light") {
  applyTeamIdentityColors(root, scheme);
  if (!team) {
    delete root.dataset.matchTeam;
    root.style.removeProperty("--match-accent");
    root.style.removeProperty("--match-team-glow");
    return;
  }
  root.dataset.matchTeam = team;
  root.style.setProperty("--match-accent", MATCH_TEAM_COLORS[team][scheme]);
  root.style.setProperty("--match-team-glow", MATCH_TEAM_COLORS[team].glow);
}
