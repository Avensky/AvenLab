import { create } from "zustand";

export type ChatChannel = "lobby" | "team";
export type ChatMessage = {
  id: number;
  channel: ChatChannel;
  context: string;
  author_id: string;
  name: string;
  text: string;
  sent_at: number;
};
export function parseChatMessage(value: unknown): ChatMessage | null {
  if (!value || typeof value !== "object") return null;
  const m = value as ChatMessage;
  return Number.isSafeInteger(m.id) &&
    m.id > 0 &&
    (m.channel === "lobby" || m.channel === "team") &&
    typeof m.context === "string" &&
    m.context.length <= 100 &&
    typeof m.author_id === "string" &&
    m.author_id.length <= 64 &&
    typeof m.name === "string" &&
    m.name.length <= 80 &&
    typeof m.text === "string" &&
    m.text.length > 0 &&
    m.text.length <= 560 &&
    Number.isFinite(m.sent_at) &&
    m.sent_at > 0
    ? m
    : null;
}
/** Ephemeral current-session text only. Never persist team chat or subscribe to
 * physics ticks. A context change discards the previous team's history. */
export const useChatStore = create<{
  profile: string | null;
  teamContext: string | null;
  history: Record<string, ChatMessage[]>;
  reset: () => void;
  membership: (
    profile: string | null,
    world: number | null,
    team: string | null,
  ) => void;
  receive: (value: unknown) => void;
  mergeHistory: (context: string, values: unknown[]) => void;
}>((set, get) => ({
  profile: null,
  teamContext: null,
  history: {},
  reset: () => set({ profile: null, teamContext: null, history: {} }),
  membership: (profile, world, team) => {
    const context =
      world !== null && (team === "red" || team === "blue")
        ? `team:${world}:${team}`
        : null;
    const old = get();
    if (profile === old.profile && context === old.teamContext) return;
    set({
      profile,
      teamContext: context,
      history:
        profile !== old.profile
          ? {}
          : old.history.lobby
            ? { lobby: old.history.lobby }
            : {},
    });
  },
  receive: (value) => {
    const m = parseChatMessage(value);
    const state = get();
    if (
      !m ||
      !state.profile ||
      (m.channel === "team"
        ? m.context !== state.teamContext
        : m.context !== "lobby")
    )
      return;
    const old = state.history[m.context] ?? [];
    if (old.some((line) => line.id === m.id)) return;
    set({
      history: {
        ...state.history,
        [m.context]: [...old, m].sort((a, b) => a.id - b.id).slice(-50),
      },
    });
  },
  mergeHistory: (context, values) => {
    const state = get();
    if (
      !state.profile ||
      (context !== "lobby" && context !== state.teamContext)
    )
      return;
    const lines = new Map((state.history[context] ?? []).map((m) => [m.id, m]));
    for (const value of values.slice(-50)) {
      const m = parseChatMessage(value);
      if (
        m &&
        m.context === context &&
        (context === "lobby" ? m.channel === "lobby" : m.channel === "team")
      )
        lines.set(m.id, m);
    }
    set({
      history: {
        ...state.history,
        [context]: [...lines.values()].sort((a, b) => a.id - b.id).slice(-50),
      },
    });
  },
}));
