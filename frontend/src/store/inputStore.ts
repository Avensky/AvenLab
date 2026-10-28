//  inputStore.ts     ← controls/input packets
import { create } from "zustand";
import { deriveInputSignals } from "./tools/deriveInputSignals";
import { reviseCockpit, unpackCockpit, type CockpitCommand, type CockpitRequest } from "./tools/cockpitMasks";
import { reviseCabin, unpackCabin, type CabinState } from "./tools/cabinMasks";
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

export type InputSource = "keyboard" | "gamepad" | "touch-steering" | "touch-throttle" | "touch-pedals" | "touch-actions";
const neutralControls = (): VehicleControlInput => ({ throttle: 0, steer: 0, brake: 0, handbrake: 0 });
// Device intent lives here, outside React. Only the merged packet goes to Rust.
const analogSources: Record<InputSource, VehicleControlInput> = {
    keyboard: neutralControls(), gamepad: neutralControls(),
    "touch-steering": neutralControls(), "touch-throttle": neutralControls(), "touch-pedals": neutralControls(), "touch-actions": neutralControls(),
};
const heldVehicleFlags = new Map<number, Set<InputSource>>();
const heldPlayerFlags = new Map<number, Set<InputSource>>();
const clampControl = (value: number, min: number, max: number) =>
    Number.isFinite(value) && value !== 0 ? Math.max(min, Math.min(max, value)) : 0;

function mergedAnalog(): VehicleControlInput {
    const sources = [analogSources.keyboard, analogSources["touch-steering"], analogSources["touch-throttle"], analogSources["touch-pedals"], analogSources["touch-actions"], analogSources.gamepad];
    // An idle producer cannot erase another device. Keyboard wins deliberate
    // axis conflicts, then touch, then gamepad. Either device can apply brakes.
    return {
        throttle: sources.find(source => source.throttle !== 0)?.throttle ?? 0,
        steer: sources.find(source => source.steer !== 0)?.steer ?? 0,
        brake: Math.max(...sources.map(source => source.brake)),
        handbrake: Math.max(...sources.map(source => source.handbrake)),
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
    cockpit_mask?: number; // optional packed cockpit request; absent keeps legacy controls
    cabin_mask?: number; // optional climate/key request, cockpit protocol v3
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
    setCockpit: (patch: Partial<CockpitRequest>, command: CockpitCommand) => void;
    setAssist: (assist: number, traction: boolean) => void;
    setCabin: (patch: Partial<CabinState>, confirmed?: number) => void;
    setIgnition: (position: number, inserted: boolean, confirmed?: number) => void;

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
        if (nextInput.cockpit_mask !== undefined && (!Number.isSafeInteger(nextInput.cockpit_mask) || nextInput.cockpit_mask < 0 || nextInput.cockpit_mask > 0xffffffff)) nextInput.cockpit_mask = previous.cockpit_mask;
        if (nextInput.cabin_mask !== undefined && (!Number.isSafeInteger(nextInput.cabin_mask) || nextInput.cabin_mask < 0 || nextInput.cabin_mask > 16383)) nextInput.cabin_mask = previous.cabin_mask;
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

    setCockpit(patch, command) {
        const current = inputRef.current;
        const initial = current.cockpit_mask ?? reviseCockpit(undefined, { lights: hasFlag(current.vehicleMask, VehicleFlags.HEADLIGHTS) ? 2 : 0, assist: hasFlag(current.vehicleMask, VehicleFlags.TCS) ? 0 : 2 }, 0);
        get().setInput({ cockpit_mask: reviseCockpit(initial, patch, command) });
    },
    setAssist(assist, traction) {
        const current = inputRef.current;
        const initial = current.cockpit_mask ?? reviseCockpit(undefined, { lights: hasFlag(current.vehicleMask, VehicleFlags.HEADLIGHTS) ? 2 : 0 }, 0);
        get().setInput({ vehicleMask: setFlag(current.vehicleMask, VehicleFlags.TCS, traction), cockpit_mask: reviseCockpit(initial, { assist }, 1) });
    },
    setCabin(patch, confirmed) {
        get().setInput({ cabin_mask: reviseCabin(inputRef.current.cabin_mask ?? confirmed, patch) });
    },
    setIgnition(position, inserted, confirmed) {
        const current=inputRef.current;
        get().setInput({cabin_mask:reviseCabin(current.cabin_mask??confirmed,{ignition:position,keyInserted:inserted},true),
          vehicleMask:setFlag(current.vehicleMask,VehicleFlags.ENGINE_ON,inserted&&position>=2&&(position===3||hasFlag(current.vehicleMask,VehicleFlags.ENGINE_ON)))});
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
        for (const source of Object.keys(analogSources) as InputSource[]) analogSources[source] = neutralControls();
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
        for (const source of Object.keys(analogSources) as InputSource[]) analogSources[source] = neutralControls();
        heldVehicleFlags.clear();
        heldPlayerFlags.clear();
        const cockpit = inputRef.current.cockpit_mask;
        const cabin = inputRef.current.cabin_mask;
        const releaseKey = cabin !== undefined && unpackCabin(cabin).ignition === 3;
        const stopCockpit = cockpit !== undefined && ((cockpit & (1 << 12)) !== 0 || ((cockpit >>> 14) & 3) !== 3);
        get().setInput({
            ...neutralControls(),
            ...(releaseKey ? { cabin_mask:reviseCabin(cabin,{ignition:2},true) } : {}),
            ...(stopCockpit ? { cockpit_mask: reviseCockpit(cockpit, { washer: false, cruiseAction: 3 }, 4) } : {}),
            vehicleMask: inputRef.current.vehicleMask & ~VehicleFlags.BOOST,
            playerMask: inputRef.current.playerMask & ~(PlayerFlags.HONK | PlayerFlags.RESET),
        });
    },

    setVehicleFlag(flag, enabled) {
    const current = inputRef.current.vehicleMask;
    const vehicleMask = setFlag(current, flag, enabled);

    const cockpit = inputRef.current.cockpit_mask;
    const cabin = inputRef.current.cabin_mask;
    get().setInput({ vehicleMask, ...(flag===VehicleFlags.ENGINE_ON && cabin!==undefined ? {cabin_mask:reviseCabin(cabin,{ignition:enabled?3:0,keyInserted:true},true)} : {}), ...(cockpit === undefined ? {} : flag === VehicleFlags.TCS
        ? { cockpit_mask: reviseCockpit(cockpit, { assist: unpackCockpit(cockpit).assist === 1 ? 1 : enabled ? 0 : 2 }, 1) }
        : flag === VehicleFlags.HEADLIGHTS ? { cockpit_mask: reviseCockpit(cockpit, { lights: enabled ? 2 : 0 }, 6) } : {}) });
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
