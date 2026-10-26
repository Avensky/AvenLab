import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

type CaptureSettings = { label: string; seconds: number; asBaseline: boolean };
export const useCaptureSettingsStore = create<CaptureSettings & { update: (value: Partial<CaptureSettings>) => void }>()(persist((set) => ({
  label: "", seconds: 10, asBaseline: false,
  update: (value) => set(value),
}), {
  name: "avenlab-performance-options-v1",
  storage: createJSONStorage(() => localStorage),
  partialize: ({ label, seconds, asBaseline }) => ({ label, seconds, asBaseline }),
  merge: (persisted, current) => {
    const data = persisted && typeof persisted === "object" ? persisted as Partial<CaptureSettings> : {};
    return { ...current, label: typeof data.label === "string" ? data.label.slice(0, 120) : "",
      seconds: data.seconds !== undefined && [5, 10, 20].includes(data.seconds) ? data.seconds : 10,
      asBaseline: data.asBaseline === true };
  },
}));
