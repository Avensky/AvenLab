import { create } from "zustand";
import type { VisualAlignment } from "../../vehicles/tools/visualAlignment";
export type AlignmentReport = VisualAlignment & { model: string };
type State = {
  reports: Record<string, AlignmentReport>;
  record: (id: string, report: AlignmentReport) => void;
  remove: (id: string) => void;
};
export const useVisualAlignmentStore = create<State>((set) => ({
  reports: {},
  record: (id, report) =>
    set((s) => ({ reports: { ...s.reports, [id]: report } })),
  remove: (id) =>
    set((s) => {
      const reports = { ...s.reports };
      delete reports[id];
      return { reports };
    }),
}));
