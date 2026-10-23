//  inputStore.ts     ← controls/input packets
import { create } from "zustand";
import { deriveInputSignals } from "./tools/deriveInputSignals";
import {
  VehicleFlags,
  PlayerFlags,
  setFlag,
  hasFlag,
} from "./tools/inputMasks";

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

export type InputSource = "keyboard" | "gamepad";
const neutralControls = (): VehicleControlInput => ({ throttle: 0, steer: 0, brake: 0, handbrake: 0 });
// Device intent lives here, outside React. Only the merged packet goes to Rust.
const analogSources: Record<InputSource, VehicleControlInput> = {
    keyboard: neutralControls(), gamepad: neutralControls(),
};
const heldVehicleFlags = new Map<number, Set<InputSource>>();
const heldPlayerFlags = new Map<number, Set<InputSource>>();
const clampControl = (value: number, min: number, max: number) =>
    Number.isFinite(value) && value !== 0 ? Math.max(min, Math.min(max, value)) : 0;

function mergedAnalog(): VehicleControlInput {
    const keyboard = analogSources.keyboard;
    const gamepad = analogSources.gamepad;
    // A pressed keyboard axis wins; an idle gamepad cannot erase it. Brakes
    // combine by maximum so either device can stop the vehicle immediately.
    return {
        throttle: keyboard.throttle !== 0 ? keyboard.throttle : gamepad.throttle,
        steer: keyboard.steer !== 0 ? keyboard.steer : gamepad.steer,
        brake: Math.max(keyboard.brake, gamepad.brake),
        handbrake: Math.max(keyboard.handbrake, gamepad.handbrake),
    };
}

function updateHold(flags: Map<number, Set<InputSource>>, source: InputSource, flag: number, enabled: boolean) {
    let owners = flags.get(flag);
    if (!owners) flags.set(flag, owners = new Set());
    if (enabled) owners.add(source); else owners.delete(source);
    if (!owners.size) flags.delete(flag);
    return owners.size > 0;
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
    debug_mask?: number; // uint32, optional
}
const defaultVehicleMask = VehicleFlags.ENGINE_ON | VehicleFlags.ABS | VehicleFlags.TCS;
const defaultPlayerMask = 0;
const defaultDebugMask = 0;

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
    debug_mask: defaultDebugMask,
  },
};

interface InputState {
    controls: VehicleControls;
    
    input: InputPacket;
    setInput: (partial: Partial<InputPacket>) => void;

    setAnalog: (partial: Partial<VehicleControlInput>) => void;
    releaseAnalog: () => void;
    setAnalogFromSource: (source: InputSource, partial: Partial<VehicleControlInput>) => void;
    releaseInputSource: (source: InputSource) => void;
    releaseControls: () => void;
    setHeldVehicleFlag: (source: InputSource, flag: number, enabled: boolean) => void;
    setHeldPlayerFlag: (source: InputSource, flag: number, enabled: boolean) => void;

    setVehicleFlag: (flag: number, enabled: boolean) => void;
    toggleVehicleFlag: (flag: number) => void;
    
    setPlayerFlag: (flag: number, enabled: boolean) => void;
    togglePlayerFlag: (flag: number) => void;
}

export const useInputStore = create<InputState>((set, get) => ({
    // Initial HUD state must include the default ABS/TCS bits too.
    controls: deriveInputSignals(inputRef.current),

    input: inputRef.current,
    setInput(partial) {
        const previous = inputRef.current;
        const nextInput: InputPacket = {
        ...inputRef.current,
        ...partial,
        };

        // Validate controls at their single writer, before JSON can turn NaN
        // into null. Input producers must call these actions, not mutate inputRef.
        nextInput.throttle = clampControl(nextInput.throttle, -1, 1);
        nextInput.steer = clampControl(nextInput.steer, -1, 1);
        nextInput.brake = clampControl(nextInput.brake, 0, 1);
        nextInput.handbrake = clampControl(nextInput.handbrake, 0, 1);
        // Polling the same held button must not broadcast another React update.
        if ((Object.keys(nextInput) as (keyof InputPacket)[])
            .every((key) => Object.is(nextInput[key], previous[key]))) return;

        inputRef.current = nextInput;

        // Zustand update only for UI/HUD/debug, not networking.
        set({
        input: nextInput,
        controls: deriveInputSignals(nextInput),
        });
    },

    setAnalog(partial) {
            // Compatibility for single-writer callers. Mounted keyboard and
            // controller producers use setAnalogFromSource instead.
            get().setInput(partial);
    },
    setAnalogFromSource(source, partial) {
        const next = { ...analogSources[source], ...partial };
        next.throttle = clampControl(next.throttle, -1, 1);
        next.steer = clampControl(next.steer, -1, 1);
        next.brake = clampControl(next.brake, 0, 1);
        next.handbrake = clampControl(next.handbrake, 0, 1);
        analogSources[source] = next;
        get().setInput(mergedAnalog());
    },
    // Legacy callers can release axes alone; producers own their individual holds.
    releaseAnalog() {
        analogSources.keyboard = neutralControls();
        analogSources.gamepad = neutralControls();
        get().setInput(neutralControls());
    },
    setHeldVehicleFlag(source, flag, enabled) {
        get().setVehicleFlag(flag, updateHold(heldVehicleFlags, source, flag, enabled));
    },
    setHeldPlayerFlag(source, flag, enabled) {
        get().setPlayerFlag(flag, updateHold(heldPlayerFlags, source, flag, enabled));
    },
    releaseInputSource(source) {
        analogSources[source] = neutralControls();
        let vehicleMask = inputRef.current.vehicleMask;
        let playerMask = inputRef.current.playerMask;
        for (const [flag, owners] of heldVehicleFlags) {
            owners.delete(source);
            vehicleMask = setFlag(vehicleMask, flag, owners.size > 0);
            if (!owners.size) heldVehicleFlags.delete(flag);
        }
        for (const [flag, owners] of heldPlayerFlags) {
            owners.delete(source);
            playerMask = setFlag(playerMask, flag, owners.size > 0);
            if (!owners.size) heldPlayerFlags.delete(flag);
        }
        get().setInput({ ...mergedAnalog(), vehicleMask, playerMask });
    },
    // Blur, disconnect and sender teardown release transient intent. Engine,
    // ABS/TCS, lights and research display toggles remain deliberate settings.
    releaseControls() {
        analogSources.keyboard = neutralControls();
        analogSources.gamepad = neutralControls();
        heldVehicleFlags.clear();
        heldPlayerFlags.clear();
        get().setInput({
            ...neutralControls(),
            vehicleMask: inputRef.current.vehicleMask & ~VehicleFlags.BOOST,
            playerMask: inputRef.current.playerMask & ~(PlayerFlags.HONK | PlayerFlags.RESET),
        });
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
