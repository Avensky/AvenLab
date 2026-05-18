// gameStore.ts ← low-frequency UI/game selection
import { create } from "zustand";

// export type GameMode = | "sandbox" | "vehicle_test" | "swarm_demo" | "signal_recon";

// export type CameraMode = | "chase" | "orbit" | "debug" | "cinematic";

// type GameStore = {
//   gameMode: GameMode;
//   cameraMode: CameraMode;
//   activeVehicleId: string | null;
//   setGameMode: (mode: GameMode) => void;
//   setCameraMode: (mode: CameraMode) => void;
//   setActiveVehicleId: (id: string | null) => void;
// };

export const cameras = ['GALLERY', 'DEFAULT', 'FIRST_PERSON', 'BIRDS_EYE'] as const
export type Camera = (typeof cameras)[number]

interface GameState {

    // =======================================
    //  Game Selection
    // =======================================
    screen: 'selection-screen' | 'game-screen'
    setScreen: (screen: 'selection-screen' | 'game-screen') => void

    selectedVehicle: string
    setSelectedVehicle: (vehicle: string) => void

    selectedMap: string
    setSelectedMap: (map: string) => void

    // =======================================
    //  Camera Settings
    // =======================================
    camera: Camera
    rotatingCamera: number
    setRotatingCamera: (angle: number) => void

    // =======================================
    //  Settings
    // =======================================
    debugBool: boolean
    binding: boolean
    editor: boolean
    help: boolean
    menu: boolean
    cli: boolean
    map: boolean
    pickcolor: boolean
    shadows: boolean
    sound: boolean
}


export const useGameStore = create<GameState>((set) => ({
    // =======================================
    //  Game Selection
    // =======================================
    screen: 'selection-screen',
    setScreen: (screen) => { set({ screen }) },
    
    selectedVehicle: 'ae86',
    setSelectedVehicle: (vehicle) => set({ selectedVehicle: vehicle }),

    selectedMap: 'rtx',
    setSelectedMap: (map) => set({ selectedMap: map }),

    camera: cameras[0],
    rotatingCamera: 0.0,
    setRotatingCamera: (angle: number) => set({ rotatingCamera: angle }),
    
    binding: false,
    debugBool: false,
    editor: false,
    help: false,
    menu: false,
    cli: false,
    map: true,
    pickcolor: false,
    shadows: true,
    sound: true,
}));
