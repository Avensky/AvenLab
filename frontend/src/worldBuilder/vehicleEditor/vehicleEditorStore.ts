import { useGameStore } from "../../store/presentation/gameStore";
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Tuning } from './tuningFields';
export type CameraProfile = {
    x: number;
    y: number;
    z: number;
    yaw: number;
    pitch: number;
    fov: number;
    duration: number;
};
export const DEFAULT_DRIVER: CameraProfile = { x: -.32, y: .4, z: .25, yaw: 0, pitch: 0, fov: 70, duration: 4 };
export type CameraView = 'chase' | 'driver' | 'bird' | 'approach';
type Preset = {
    tuning: Tuning;
    camera: CameraProfile;
};
export const useVehicleEditorStore = create(persist<{
    presets: Record<string, Preset>;
    cameras: Record<string, CameraProfile>;
    view: CameraView;
    replay: number;
    setCamera: (id: string, camera: CameraProfile) => void;
    setView: (view: CameraView) => void;
    save: (id: string, tuning: Tuning) => void;
}>((set, get) => ({
    presets: {}, cameras: {}, view: 'chase', replay: 0,
    setCamera: (id, camera) => set(s => ({ cameras: { ...s.cameras, [id]: camera } })),
    setView: view => { useGameStore.setState({ camera: view === 'driver' || view === 'approach' ? 'FIRST_PERSON' : view === 'bird' ? 'BIRDS_EYE' : 'DEFAULT' }); set(s => ({ view, replay: s.replay + 1 })); },
    save: (id, tuning) => set(s => ({ presets: { ...s.presets, [id]: { tuning, camera: get().cameras[id] ?? DEFAULT_DRIVER } } })),
}), { name: 'avenlab-vehicle-editor-v1', version: 1,
    partialize: state => ({ ...state, view: 'chase', replay: 0 }) }));
