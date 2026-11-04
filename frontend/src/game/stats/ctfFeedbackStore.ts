import { create } from "zustand";

export const useCtfFeedbackStore = create<{
  capture: { id: string; team: "red" | "blue"; at: number } | null;
}>()(() => ({ capture: null }));

let expiry: ReturnType<typeof setTimeout> | null = null;
export function clearCaptureFeedback() {
  if (expiry) clearTimeout(expiry);
  expiry = null;
  useCtfFeedbackStore.setState({ capture: null });
}
export function showCaptureFeedback(capture: { id: string; team: "red" | "blue"; at: number }) {
  clearCaptureFeedback();
  useCtfFeedbackStore.setState({ capture });
  expiry = setTimeout(() => {
    if (useCtfFeedbackStore.getState().capture?.id === capture.id) clearCaptureFeedback();
  }, 3500);
}
