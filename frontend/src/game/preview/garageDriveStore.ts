import { create } from "zustand";

export const GARAGE_CAMERAS = ["Showroom", "High Angle", "Driver Door", "Cockpit", "Chase"] as const;
export type GarageCamera = typeof GARAGE_CAMERAS[number];
export type DriveStage = "idle" | "station" | "opening" | "entering" | "closing" | "driving" | "finished";

const stageCamera: Record<DriveStage, GarageCamera> = {
  idle: "Showroom", station: "Cockpit", opening: "Driver Door", entering: "Driver Door", closing: "Cockpit", driving: "Chase", finished: "Chase",
};

type GarageDrive = {
  stage: DriveStage;
  camera: GarageCamera | null;
  ready: boolean;
  error: string | null;
  steering: { id: "199" | "200" } | null;
  enterStation: () => void;
  start: () => void;
  reset: () => void;
  nextCamera: () => void;
};

export const garageCamera = (state: Pick<GarageDrive, "stage" | "camera">) => state.camera ?? stageCamera[state.stage];

export const useGarageDrive = create<GarageDrive>()((set) => ({
  stage: "idle", camera: null, ready: false, error: null, steering: null,
  enterStation: () => set(state => state.ready && state.stage === "idle" ? { stage: "station", camera: null, error: null, steering: null } : state),
  start: () => set(state => state.ready && state.stage === "idle" ? { stage: "opening", camera: null, error: null, steering: null } : state),
  reset: () => set({ stage: "idle", camera: null, error: null, steering: null }),
  nextCamera: () => set(state => ({ camera: GARAGE_CAMERAS[(GARAGE_CAMERAS.indexOf(garageCamera(state)) + 1) % GARAGE_CAMERAS.length] })),
}));
