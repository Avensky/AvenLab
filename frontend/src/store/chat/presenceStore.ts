import { create } from "zustand";
import type { SocialView } from "../social/socialStore";

export type PresenceEvent = {
  id: number;
  world: number | null;
  text: string;
  sent_at: number;
};
type Snapshot = {
  profile: string;
  world: number | null;
  name: string;
  online: Map<string, string>;
  members: Map<string, string>;
  reconnecting: Set<string>;
};
function snapshot(view: SocialView): Snapshot {
  const world = view.worlds.find((world) => world.id === view.current_world_id);
  const active = view.alpha?.active;
  const roster =
    active?.world_id === view.current_world_id
      ? (view.alpha?.roster.filter((member) => member.mode === active.mode) ??
        [])
      : [];
  return {
    profile: view.profile.id,
    world: view.current_world_id,
    name: world?.name ?? "world",
    online: new Map(
      view.players
        .filter((person) => person.online)
        .map((person) => [person.id, person.name]),
    ),
    members: new Map(
      world
        ? world.members.map((member) => [
            member.profile_id ?? member.player_id,
            member.name,
          ])
        : roster
            .filter((member) => !member.reconnecting)
            .map((member) => [member.id, member.name]),
    ),
    reconnecting: new Set(
      roster.filter((member) => member.reconnecting).map((member) => member.id),
    ),
  };
}
/** Local notices derive only from validated, personalized server social views.
 * First snapshots establish a baseline; repeated views/physics never add notices.
 * No synthetic messages are sent through chat or persisted to a profile. */
export const usePresenceStore = create<{
  events: PresenceEvent[];
  activity: number;
  reset: () => void;
  observe: (view: SocialView) => void;
}>((set, get) => {
  let previous: Snapshot | null = null,
    serial = 0;
  return {
    events: [],
    activity: 0,
    reset: () => {
      previous = null;
      serial = 0;
      set({ events: [], activity: 0 });
    },
    observe: (view) => {
      const current = snapshot(view),
        before = previous;
      previous = current;
      if (!before || before.profile !== current.profile) {
        serial = 0;
        set({ events: [], activity: 0 });
        return;
      }
      const changes: string[] = [];
      if (before.world !== current.world) {
        changes.push(
          current.world === null
            ? `You left ${before.name}.`
            : `You joined ${current.name}.`,
        );
      } else if (current.world !== null) {
        for (const [id, name] of before.members)
          if (id !== current.profile && !current.members.has(id))
            changes.push(
              `${name} ${current.online.has(id) ? "left the world" : "disconnected"}.`,
            );
        for (const [id, name] of current.members)
          if (id !== current.profile && !before.members.has(id))
            changes.push(
              `${name} ${before.reconnecting.has(id) ? "reconnected" : "joined the world"}.`,
            );
      } else {
        for (const [id, name] of before.online)
          if (!current.online.has(id)) changes.push(`${name} disconnected.`);
        for (const [id, name] of current.online)
          if (!before.online.has(id)) changes.push(`${name} connected.`);
      }
      if (!changes.length) return;
      const events = before.world === current.world ? get().events : [];
      const added = changes.map((text) => ({
        id: ++serial,
        world: current.world,
        text,
        sent_at: Date.now() / 1000,
      }));
      set({
        events: [...events, ...added].slice(-50),
        activity: get().activity + added.length,
      });
    },
  };
});
