import { create } from "zustand";
import type { VehicleModelId } from "../../vehicles/tools/vehicleModelPaths";

export const CHARACTER_CAMERAS = ["Full body", "Face", "Hands", "Whole car"] as const;
export const CHARACTER_ZOOM_MIN = .8;
export const CHARACTER_ZOOM_MAX = 1.25;
type Camera = typeof CHARACTER_CAMERAS[number];

export const useCharacterPreviewStore = create<{
  playbackPaused: boolean;
  automaticEmotes: boolean;
  camera: Camera;
  zoom: number;
  emote: { id: string } | null;
  cockpitVehicle: VehicleModelId | null;
  cockpitAvailable: boolean;
  cockpitError: string | null;
  insideCar: boolean;
  leanAvailable: boolean;
}>(() => ({ playbackPaused: false, automaticEmotes: true, camera: "Full body", zoom: 1, emote: null, cockpitVehicle: null, cockpitAvailable: false, cockpitError: null, insideCar: false, leanAvailable: false }));

export function failCockpitPreview(message: string) {
  if (useCharacterPreviewStore.getState().insideCar) {
    useCharacterPreviewStore.setState({ insideCar: false, emote: null, cockpitError: message });
  }
}
