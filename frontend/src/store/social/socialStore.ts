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
  mode?: GameMode | null;
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

/** Human-rate, server-owned data. Physics snapshots never write this store. */
export const useSocialStore = create<{
  available: boolean;
  view: SocialView | null;
  message: string;
  entryCode: string;
  reset: () => void;
  receive: (value: unknown) => void;
}>((set) => ({
  available: false,
  view: null,
  message:
    "Connect to the updated game server to use worlds and social groups.",
  entryCode: "",
  reset: () =>
    set({
      available: false,
      view: null,
      message: "Connecting to the game server…",
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
    set({ view, message: "Connected" });
  },
}));
