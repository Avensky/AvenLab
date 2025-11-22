import { create } from "zustand";
import type { BodySnapshot } from "../types/snapshot";

export type RenderMode = "glb" | "geometry" | "collider";

interface SnapshotState {
    bodies: BodySnapshot[];
    mode: RenderMode;
    setBodies: (bodies: BodySnapshot[]) => void;
    setMode: (mode: RenderMode) => void;
}

export const useSnapshotStore = create<SnapshotState>((set) => ({
    bodies: [],
    mode: "glb",
    setBodies: (bodies) => set({ bodies }),
    setMode: (mode) => set({ mode })
}));
