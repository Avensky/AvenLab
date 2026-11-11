import { create } from "zustand";
import type { CockpitTake } from "../characters/cockpitEmotes";

export const GARAGE_CAMERAS = ["Showroom", "High Angle", "Driver Door", "Cockpit", "Chase", "Dashboard"] as const;
export type GarageCamera = typeof GARAGE_CAMERAS[number];
export type DriveStage = "idle" | "station" | "opening" | "entering" | "closing" | "driving" | "finished";

const stageCamera: Record<DriveStage, GarageCamera> = {
  idle: "Showroom", station: "Cockpit", opening: "Driver Door", entering: "Driver Door", closing: "Cockpit", driving: "Chase", finished: "Chase",
};

type GarageDrive = {
  stage: DriveStage;
  camera: GarageCamera | null;
  ready: boolean;
  hasDoor: boolean;
  panelsHidden: boolean;
  sequence: "entry" | "drive" | null;
  error: string | null;
  steering: { id: CockpitTake["id"] } | null;
  enterStation: () => void;
  start: () => void;
  reset: () => void;
  nextCamera: (dashboard?: boolean) => void;
};

export const garageCamera = (state: Pick<GarageDrive, "stage" | "camera">) => state.camera ?? stageCamera[state.stage];

export const useGarageDrive = create<GarageDrive>()((set) => ({
  stage: "idle", camera: null, ready: false, hasDoor: false, panelsHidden: false, sequence: null, error: null, steering: null,
  enterStation: () => set(state => state.ready && state.stage === "idle" ? { stage: state.hasDoor ? "opening" : "station", sequence: "entry", camera: null, error: null, steering: null } : state),
  start: () => set(state => state.ready && state.stage === "idle" ? { stage: "opening", sequence: "drive", camera: null, error: null, steering: null } : state),
  reset: () => set({ stage: "idle", sequence: null, panelsHidden: false, camera: null, error: null, steering: null }),
  nextCamera: (dashboard = true) => set(state => {
    const views = GARAGE_CAMERAS.filter(view => dashboard || view !== "Dashboard");
    return { camera: views[(views.indexOf(garageCamera(state)) + 1) % views.length] };
  }),
}));
