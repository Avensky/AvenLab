import { create } from "zustand";
/** A gameplay adapter publishes these only after confirmed mission events.
 * This presentation store never decides success, scoring, or CAN research runs. */
export type MissionRadioNotice = {
  id: string;
  title: string;
  message: string;
  kind: "briefing" | "complete" | "update";
};
export const useMissionRadioStore = create<{
  current: MissionRadioNotice | null;
  history: MissionRadioNotice[];
  publish: (notice: MissionRadioNotice) => void;
  clear: () => void;
}>((set) => ({
  current: null,
  history: [],
  publish: (notice) => {
    if (
      !notice.id.trim() ||
      !notice.title.trim() ||
      !notice.message.trim() ||
      !["briefing", "complete", "update"].includes(notice.kind)
    )
      return;
    const clean = {
      id: notice.id.slice(0, 96),
      title: notice.title.slice(0, 100),
      message: notice.message.slice(0, 240),
      kind: notice.kind,
    };
    set((state) =>
      state.history.some((item) => item.id === clean.id)
        ? state
        : { current: clean, history: [clean, ...state.history].slice(0, 12) },
    );
  },
  clear: () => set({ current: null, history: [] }),
}));
