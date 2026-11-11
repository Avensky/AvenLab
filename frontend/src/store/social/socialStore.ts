import type { AlphaView, Progression, GameMode } from "../alpha/alphaStore";
import { create } from "zustand";

export type SocialPerson = {
  id: string;
  name: string;
  online: boolean;
  team?: "red" | "blue" | null;
};
export type SocialGroup = {
  id: string;
  name: string;
  owner_id: string;
  joined: boolean;
  members: SocialPerson[];
  invited: SocialPerson[];
};
export type SocialWorld = {
  tire_thermals?: boolean;
  mode?: GameMode | null;
  team_size?: 1 | 3 | 5 | null;
  id: number;
  name: string;
  map: string;
  owner_id: string | null;
  listed: boolean;
  max_players: number;
  players: number;
  active: boolean;
  locked: boolean;
  invite_code: string | null;
  members: {
    player_id: string;
    level?: number | null;
    profile_id: string | null;
    name: string;
    team: "red" | "blue";
  }[];
};
export type WorldInvitation = {
  id: string;
  world_id: number;
  world_name: string;
  map: string;
  from: SocialPerson;
  locked: boolean;
  expires: number;
};
export type SocialView = {
  profile: { id: string; name: string; progression?: Progression };
  alpha?: AlphaView;
  players: SocialPerson[];
  teammates: SocialPerson[];
  requests: { player: SocialPerson; incoming: boolean }[];
  groups: SocialGroup[];
  worlds: SocialWorld[];
  world_invites: WorldInvitation[];
  current_world_id: number | null;
  limits: {
    active_worlds: number;
    max_active_worlds: number;
    active_players: number;
    max_players: number;
  };
  maps: string[];
};

const person = (value: unknown) => {
  if (!value || typeof value !== "object") return false;
  const person = value as SocialPerson;
  return (
    typeof person.id === "string" &&
    typeof person.name === "string" &&
    typeof person.online === "boolean" &&
    (person.team == null || person.team === "red" || person.team === "blue")
  );
};

type Cosmetics = Pick<Progression, "character" | "character_presets" | "default_hero" | "hero_loadouts" | "cosmetics_revision">;

export function selectEquippedCharacter(state: { view: SocialView | null; cachedCosmetics: Cosmetics | null }) {
  return state.view ? state.view.profile.progression?.character : state.cachedCosmetics?.character;
}

function cosmeticsFrom({ character, character_presets, default_hero, hero_loadouts, cosmetics_revision }: Cosmetics): Cosmetics {
  return { character, character_presets, default_hero, hero_loadouts, cosmetics_revision };
}

function hasCosmeticsRevision(cosmetics: unknown): cosmetics is Cosmetics & { cosmetics_revision: number } {
  if (!cosmetics || typeof cosmetics !== "object") return false;
  const revision = (cosmetics as Cosmetics).cosmetics_revision;
  return typeof revision === "number" && Number.isSafeInteger(revision) && revision >= 0;
}

/** Human-rate, server-owned data. Physics snapshots never write this store. */
export const useSocialStore = create<{
  available: boolean;
  profileStatus: "idle" | "restoring" | "ready" | "error";
  profileScope: "device" | "tab" | null;
  /** Editor key retained through a transport reconnect. Actions still require the current view. */
  profileOwner: string | null;
  cachedCosmetics: Cosmetics | null;
  view: SocialView | null;
  message: string;
  recoveryMessage?:string;
  entryCode: string;
  reset: () => void;
  receive: (value: unknown) => void;
  acknowledgeProgression: (owner: string, fallback: (progression: Progression) => Progression, cosmetics?: unknown) => void;
}>((set) => ({
  available: false,
  profileStatus: "idle",
  profileScope: null,
  profileOwner: null,
  cachedCosmetics: null,
  view: null,
  message:
    "Connect to the updated game server to use worlds and social groups.",
  entryCode: "",
  reset: () =>
    set({
      available: false,
      profileStatus: "idle",
      profileScope: null,
      view: null,
      message: "Connecting to the game server…",
    }),
  acknowledgeProgression: (owner, fallback, cosmetics) => set(state => {
    const view = state.view;
    const profile = view?.profile;
    if (!view || profile?.id !== owner || !profile.progression) return state;
    const current = profile.progression;
    if (hasCosmeticsRevision(cosmetics) && (current.cosmetics_revision ?? -1) >= cosmetics.cosmetics_revision) return state;
    const progression = hasCosmeticsRevision(cosmetics) ? { ...current, ...cosmeticsFrom(cosmetics) } : fallback(current);
    return { view: { ...view, profile: { ...profile, progression } }, cachedCosmetics: cosmeticsFrom(progression) };
  }),
  receive: (value) => {
    if (!value || typeof value !== "object") return;
    const view = value as SocialView;
    if (
      typeof view.profile?.id !== "string" ||
      typeof view.profile.name !== "string" ||
      !view.limits ||
      !Number.isSafeInteger(view.limits.max_active_worlds)
    )
      return;
    if (
      view.alpha &&
      (!Array.isArray(view.alpha.roster) ||
        !Array.isArray(view.alpha.skins) ||
        view.alpha.roster.some(
          (member) =>
            !member ||
            typeof member.name !== "string" ||
            typeof member.hero !== "string",
        ))
    )
      return;
    for (const key of [
      "players",
      "teammates",
      "requests",
      "groups",
      "worlds",
      "world_invites",
      "maps",
    ] as const)
      if (!Array.isArray(view[key]) || view[key].length > 1024) return;
    if (
      !view.players.every(person) ||
      !view.teammates.every(person) ||
      !view.requests.every(
        (request) =>
          request &&
          person(request.player) &&
          typeof request.incoming === "boolean",
      )
    )
      return;
    if (
      !view.groups.every(
        (group) =>
          group &&
          typeof group.id === "string" &&
          typeof group.name === "string" &&
          typeof group.owner_id === "string" &&
          typeof group.joined === "boolean" &&
          Array.isArray(group.members) &&
          group.members.length <= 10 &&
          group.members.every(person) &&
          Array.isArray(group.invited) &&
          group.invited.every(person),
      )
    )
      return;
    if (
      !view.worlds.every(
        (world) =>
          world &&
          Number.isSafeInteger(world.id) &&
          typeof world.name === "string" &&
          typeof world.map === "string" &&
          typeof world.locked === "boolean" &&
          Number.isInteger(world.players) &&
          Number.isInteger(world.max_players) &&
          Array.isArray(world.members) &&
          world.members.length <= 10 &&
          world.members.every(
            (member) =>
              member &&
              typeof member.name === "string" &&
              (member.team === "red" || member.team === "blue"),
          ),
      )
    )
      return;
    if (
      !view.world_invites.every(
        (invite) =>
          invite &&
          typeof invite.id === "string" &&
          typeof invite.world_name === "string" &&
          Number.isSafeInteger(invite.world_id) &&
          person(invite.from),
      )
    )
      return;
    if (
      !view.maps.every(
        (map) => typeof map === "string" && /^[a-zA-Z0-9_-]+$/.test(map),
      )
    )
      return;
    set(state => {
      const incoming = view.profile.progression;
      const current = state.view?.profile.id === view.profile.id ? state.view.profile.progression : undefined;
      // A reliable reply can arrive before a replaceable snapshot that was captured earlier.
      // Keep newer cosmetics while still consuming the snapshot's world and career data.
      const profile = hasCosmeticsRevision(incoming) && hasCosmeticsRevision(current)
        && incoming.cosmetics_revision <= current.cosmetics_revision
        ? { ...view.profile, progression: { ...incoming, ...cosmeticsFrom(current) } }
        : view.profile;
      return { view: { ...view, profile }, profileOwner: profile.id, profileStatus: "ready", message: "Connected",
        cachedCosmetics: profile.progression ? cosmeticsFrom(profile.progression) : null };
    });
  },
}));
