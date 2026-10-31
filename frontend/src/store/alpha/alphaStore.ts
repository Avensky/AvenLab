import { create } from "zustand";
import { useSelectionStore, vehicleCatalog } from "../selection/selectionStore";
export type GameMode = "quickplay" | "competitive" | "sandbox" | "editor";
export type HeroRole = "tank" | "dps" | "support";
export const GAME_MODES: {
  id: GameMode;
  label: string;
  description: string;
}[] = [
  {
    id: "quickplay",
    label: "QUICKPLAY",
    description: "Casual 5v5 · shared alpha match slot",
  },
  {
    id: "competitive",
    label: "COMPETITIVE",
    description: "Ranked 5v5 · shared alpha match slot",
  },
  {
    id: "sandbox",
    label: "SANDBOX",
    description: "Solo / practice · choose your environment",
  },
  {
    id: "editor",
    label: "WORLD BUILDER",
    description: "One live editor slot · build and test ramps",
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
    position: number;
    size: number;
    joined: number;
    reason: string;
  } | null;
  active: {
    mode: GameMode;
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
  }[];
  reconnect_grace_seconds: number;
  reserved_players: number;
  skins: { id: string; name: string; cost: number; color: string }[];
};
export const useAlphaStore = create<{
  mode: GameMode;
  hero: string;
  chooseMode: (mode: GameMode) => void;
  chooseHero: (id: string) => void;
}>((set) => ({
  mode: "quickplay",
  hero: "ae86",
  chooseMode: (mode) => set({ mode }),
  chooseHero: (id) => {
    const hero = HEROES.find((h) => h.id === id);
    if (!hero) return;
    useSelectionStore.setState({
      vehicleIndex: Math.max(
        0,
        vehicleCatalog.findIndex((v) => v.id === hero.vehicle),
      ),
    });
    set({ hero: id });
  },
}));
