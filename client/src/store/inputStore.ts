//  inputStore.ts     ← controls/input packets
import { create } from "zustand";
import { deriveVehicleSignals } from "../utils/deriveVehicleSignals";
import {
  VehicleFlags,
  PlayerFlags,
  setFlag,
  hasFlag,
} from "./inputMasks";

export interface VehicleControls {
    braking: boolean
    accelerating: boolean
    reversing: boolean
    coasting: boolean
    absActive?: boolean
    tractionControl?: boolean
}
export interface VehicleControlInput {
    throttle: number;   // [-1..1]
    steer: number;      // [-1..1]
    brake: number;      // [0..1]
    handbrake: number;  // [0..1]
}

export interface VehicleStateInput {
    engineOn: boolean;
    headlights: boolean;
    blinkerLeft: boolean;
    blinkerRight: boolean;
    hazards: boolean;
    abs: boolean;
    tcs: boolean;
    boost: boolean;
}

export interface PlayerStateInput {
    candump: boolean,
    liveCan: boolean,
    dyno: boolean,
    radio: boolean,
    honk: boolean,
    reset: boolean,
}


export interface InputPacket {
    type: "input";
    seq: number;
    dt: number;

    // analog controls (always present)
    throttle: number;   // [-1..1]
    steer: number;      // [-1..1]
    brake: number;      // [0..1]
    handbrake: number;  // [0..1]

    // bitmasks
    vehicleMask: number; // uint16
    playerMask: number;  // uint16
}
const defaultVehicleMask = VehicleFlags.ENGINE_ON | VehicleFlags.ABS | VehicleFlags.TCS;
const defaultPlayerMask = PlayerFlags.CANDUMP 
| PlayerFlags.LIVECAN 
| PlayerFlags.DYNO 
| PlayerFlags.RADIO 
| PlayerFlags.HONK 
| PlayerFlags.RESET;

export const inputRef: { current: InputPacket } = {
  current: {
    type: "input",
    seq: 0,
    dt: 0,
    throttle: 0,
    steer: 0,
    brake: 0,
    handbrake: 0,
    vehicleMask: defaultVehicleMask,
    playerMask: defaultPlayerMask,
  },
};

interface InputState {
    controls: VehicleControls;
    
    input: InputPacket;
    setInput: (partial: Partial<InputPacket>) => void;

    setAnalog: (partial: Partial<VehicleControlInput>) => void;

    setVehicleFlag: (flag: number, enabled: boolean) => void;
    toggleVehicleFlag: (flag: number) => void;
    
    setPlayerFlag: (flag: number, enabled: boolean) => void;
    togglePlayerFlag: (flag: number) => void;
}

export const useInputStore = create<InputState>((set, get) => ({
    controls: {
        braking: false,
        accelerating: false,
        reversing: false,
        coasting: true,
    },

    input: inputRef.current,
    setInput(partial) {
        const nextInput: InputPacket = {
        ...inputRef.current,
        ...partial,
        };

        inputRef.current = nextInput;

        // Zustand update only for UI/HUD/debug, not networking.
        set({
        input: nextInput,
        controls: deriveVehicleSignals(nextInput),
        });
    },

    setAnalog(partial) {
            get().setInput(partial);
    },

    setVehicleFlag(flag, enabled) {
    const current = inputRef.current.vehicleMask;
    const vehicleMask = setFlag(current, flag, enabled);

    get().setInput({ vehicleMask });
    },

    toggleVehicleFlag(flag) {
    const current = inputRef.current.vehicleMask;
    const enabled = !hasFlag(current, flag);

    get().setVehicleFlag(flag, enabled);
    },

    setPlayerFlag(flag, enabled) {
    const current = inputRef.current.playerMask;
    const playerMask = setFlag(current, flag, enabled);

    get().setInput({ playerMask });
    },

    togglePlayerFlag(flag) {
    const current = inputRef.current.playerMask;
    const enabled = !hasFlag(current, flag);

    get().setPlayerFlag(flag, enabled);
    },
}));
