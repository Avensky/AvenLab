import { create } from "zustand";

export const CHARACTER_CAMERAS = ["Full body", "Face", "Hands", "Whole car"] as const;
export const CHARACTER_ZOOM_MIN = .8;
export const CHARACTER_ZOOM_MAX = 1.25;
type Camera = typeof CHARACTER_CAMERAS[number];

export const useCharacterPreviewStore = create<{
  camera: Camera;
  zoom: number;
  emote: { id: string } | null;
  cockpitAvailable: boolean;
  cockpitError: string | null;
  insideCar: boolean;
  leanAvailable: boolean;
}>(() => ({ camera: "Full body", zoom: 1, emote: null, cockpitAvailable: false, cockpitError: null, insideCar: false, leanAvailable: false }));

export function failCockpitPreview(message: string) {
  if (useCharacterPreviewStore.getState().insideCar) {
    useCharacterPreviewStore.setState({ insideCar: false, emote: null, cockpitError: message });
  }
}
