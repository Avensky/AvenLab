import { useHeroLoadouts, type HeroAppearance } from "../../vehicles/cosmetics/heroLoadouts";
import { create } from "zustand";
import { useSelectionStore, vehicleCatalog } from "../selection/selectionStore";
import { usePreferencesStore } from "../preferences/preferencesStore";
export type GameMode = "quickplay" | "competitive" | "skirmish" | "sandbox" | "editor";
export type MatchTeamSize = 3 | 5;
export type MatchCategory = "quickplay" | "competitive";
/** Research/planned modes are garage destinations, never server mode_join IDs. */
export type PlayMode = GameMode | "signal_recon" | "swarm";
export type HeroRole = "tank" | "dps" | "support";
export type HeroFilter = HeroRole | "all";
export const HERO_FILTERS: HeroFilter[] = ["all", "tank", "dps", "support"];
export const GAME_MODES: {
  id: PlayMode;
  label: string;
  description: string;
}[] = [
  {
    id: "quickplay",
    label: "QUICKPLAY",
    description: "Alpha CTF · first to 3 captures",
  },
  {
    id: "competitive",
    label: "COMPETITIVE",
    description: "CTF alpha · ranked MMR pending",
  },
  {
    id: "sandbox",
    label: "SANDBOX",
    description: "Solo / practice · choose your environment",
  },
  {
    id: "editor",
    label: "WORLD EDITOR",
    description: "One live editor slot · build and test ramps",
  },
  {
    id: "signal_recon",
    label: "SIGNAL RECON",
    description: "Choose an interface and CAN research mode",
  },
  {
    id: "swarm",
    label: "SWARM COMMAND",
    description: "PLANNED · Multi-domain vehicle orchestration",
  },
];
export const HEROES: {
  id: string;
  name: string;
  vehicle: string;
  role: HeroRole;
  note: string;
}[] = [
  {
    id: "tank",
    name: "VANGUARD",
    vehicle: "tank",
    role: "tank",
    note: "TANK · armored chassis",
  },
  {
    id: "ae86",
    name: "AE86",
    vehicle: "ae86",
    role: "dps",
    note: "DPS · agile attack chassis",
  },
  {
    id: "brz",
    name: "BRZ",
    vehicle: "brz",
    role: "dps",
    note: "DPS · balanced attack chassis",
  },
  {
    id: "camaro",
    name: "CAMARO",
    vehicle: "camaro",
    role: "dps",
    note: "DPS · muscle chassis",
  },
  {
    id: "supra",
    name: "SUPRA",
    vehicle: "supra",
    role: "dps",
    note: "DPS · pursuit chassis",
  },
  {
    id: "mechanic",
    name: "MECHANIC",
    vehicle: "brz",
    role: "support",
    note: "SUPPORT · BRZ chassis · abilities in development",
  },
  {
    id: "logistics",
    name: "LOGISTICS",
    vehicle: "ae86",
    role: "support",
    note: "SUPPORT · AE86 chassis · abilities in development",
  },
];
export type Progression = {
  career?: import("../../game/career/careerTypes").CareerSummary;
  default_hero?: string;
  hero_loadouts?: Record<string,HeroAppearance>;
  level: number;
  prestige: number;
  xp: number;
  required_xp: number;
  tier: string;
  competitive_wins: number;
  quickplay_wins: number;
  matches: number;
  credits: number;
  owned: string[];
  equipped: string;
  color: string;
  next_milestone: number;
};
export type AlphaView = {
  role_limits?: boolean;
  enabled: boolean;
  queue: {
    mode: GameMode;
    team_size?: number;
    capacity?: number;
    position: number;
    size: number;
    joined: number;
    reason: string;
  } | null;
  active: {
    mode: GameMode;
    team_size?: number;
    capacity?: number;
    role_caps?: Record<HeroRole, number>;
    role_minimums?: Record<HeroRole, number>;
    world_id: number;
    hero: string;
    team: "red" | "blue";
  } | null;
  roster: {
    id: string;
    name: string;
    team: "red" | "blue";
    hero: string;
    mode: GameMode;
    reconnecting: boolean;
    world_id?: number;
    appearance?: HeroAppearance;
    showcase_hero?:string;
  }[];
  reconnect_grace_seconds: number;
  reserved_players: number;
  skins: { id: string; name: string; cost: number; color: string }[];
};
export const useAlphaStore = create<{
  mode: PlayMode;
  /** Match format is independent of the Quickplay/Competitive queue category. */
  teamSize: MatchTeamSize;
  lastMatchMode: MatchCategory;
  hero: string | null;
  previewHero: string | null;
  /** An explicit empty admission is known state, not a reconnect to hydrate. */
  selectionInitialized: boolean;
  chooseMode: (mode: PlayMode) => void;
  chooseTeamSize: (size: MatchTeamSize) => void;
  restoreMode: (mode: PlayMode, confirmedSize?: number) => void;
  chooseHero: (id: string) => void;
  preview: (id: string) => void;
  clearHero: () => void;
}>((set) => ({
  mode: "quickplay",
  teamSize: 5,
  lastMatchMode: "quickplay",
  hero: null,
  previewHero: null,
  selectionInitialized: false,
  chooseMode: (mode) => {
    const next=canonicalGameMode(mode);
    set({mode:next,...(mode==='skirmish'?{teamSize:3 as const}:{}),...(next==='quickplay'||next==='competitive'?{lastMatchMode:next}:{})});
  },
  chooseTeamSize: (teamSize) => {if(teamSize===3||teamSize===5)set({teamSize});},
  restoreMode: (mode, confirmedSize) => {
    const next=canonicalGameMode(mode);
    set({mode:next,...(isMatchMode(mode)?{teamSize:modeTeamSize(mode,confirmedSize)}:{}),...(next==='quickplay'||next==='competitive'?{lastMatchMode:next}:{})});
  },
  clearHero: () =>
    set({ hero: null, previewHero: null, selectionInitialized: true }),
  preview: (id) => {
    const hero = HEROES.find((h) => h.id === id);
    if (!hero) return;
    useSelectionStore.setState({
      vehicleIndex: Math.max(
        0,
        vehicleCatalog.findIndex((v) => v.id === hero.vehicle),
      ),
    });
    set({ previewHero: id });
  },
  chooseHero: (id) => {
    if (!HEROES.some((h) => h.id === id)) return;
    useAlphaStore.getState().preview(id);
    set({ hero: id, selectionInitialized: true });
  },
}));

/** A showcase is a preference, never a submitted match pick. Both stages use
 * the same garage and animation owner; only chooseHero confirms a loadout. */
export function showFavoriteHero() {
  const hero=HEROES.find(h=>h.id===useHeroLoadouts.getState().defaultHero);
  const vehicle=hero?.vehicle??usePreferencesStore.getState().favoriteVehicles[0];
  const index=vehicleCatalog.findIndex(v=>v.id===vehicle);
  if(index>=0)useSelectionStore.setState({vehicleIndex:index});
}

/** Mouse, keyboard and controller Back share the same research setup parent. */
export function reconSetupParent(): "hero_select" | "main" {
  return useAlphaStore.getState().mode === "signal_recon"
    ? "hero_select"
    : "main";
}

/** Modes share the CTF loop; the server owns admission, capacities and rewards. */
export function isMatchMode(mode: string): mode is "quickplay" | "competitive" | "skirmish" {
  return mode === "quickplay" || mode === "competitive" || mode === "skirmish";
}
export function modeTeamSize(mode: string, confirmedSize?: number): 3 | 5 {
  return confirmedSize === 3 || confirmedSize === 5 ? confirmedSize : mode === "skirmish" ? 3 : 5;
}
/** Old saved casual3v3 admissions remain readable without a duplicate tab. */
export function canonicalGameMode<T extends string>(mode:T):Exclude<T,"skirmish">|"quickplay" {
  return (mode === "skirmish" ? "quickplay" : mode) as Exclude<T,"skirmish">|"quickplay";
}
export function gameModeLabel(mode: string): string {
  return GAME_MODES.find(item => item.id === canonicalGameMode(mode))?.label ?? mode.replaceAll("_", " ").toUpperCase();
}
export function matchModeLabel(mode:string, confirmedSize?:number):string {
  return isMatchMode(mode) ? `${gameModeLabel(mode)} · ${modeTeamSize(mode,confirmedSize)}V${modeTeamSize(mode,confirmedSize)}` : gameModeLabel(mode);
}
