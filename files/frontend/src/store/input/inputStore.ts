//  inputStore.ts     ← controls/input packets
import { create } from "zustand";
import { useNetworkStore } from "../session/networkStore";
import {
  reviseCabin,
  unpackCabin,
  HEADLIGHT_FLASH,
  CABIN_MAX_MASK,
  type CabinState,
} from "./protocol/cabinMasks";
import {
  reviseCockpit,
  unpackCockpit,
  type CockpitCommand,
  type CockpitRequest,
} from "./protocol/cockpitMasks";
import { deriveInputSignals } from "./protocol/deriveInputSignals";
import {
  hasFlag,
  PlayerFlags,
  setFlag,
  VehicleFlags,
} from "./protocol/inputMasks";

export interface VehicleControls {
  braking: boolean;
  accelerating: boolean;
  reversing: boolean;
  coasting: boolean;
  absActive?: boolean;
  tractionControl?: boolean;
}
export interface VehicleControlInput {
  throttle: number; // [-1..1]
  steer: number; // [-1..1]
  brake: number; // [0..1]
  handbrake: number; // [0..1]
}

export type InputSource =
  | "keyboard"
  | "gamepad"
  | "touch-steering"
  | "touch-throttle"
  | "touch-pedals"
  | "touch-actions"
  | "touch-parking";
const neutralControls = (): VehicleControlInput => ({
  throttle: 0,
  steer: 0,
  brake: 0,
  handbrake: 0,
});
// A menu owns its brake independently of every physical device. Releasing a
// keyboard, controller or touch hold cannot clear this brake while paused.
let menuBrake = false;
// Device intent lives here, outside React. Only the merged packet goes to Rust.
const analogSources: Record<InputSource, VehicleControlInput> = {
  keyboard: neutralControls(),
  gamepad: neutralControls(),
  "touch-steering": neutralControls(),
  "touch-throttle": neutralControls(),
  "touch-pedals": neutralControls(),
  "touch-actions": neutralControls(),
  "touch-parking": neutralControls(),
};
const heldVehicleFlags = new Map<number, Set<InputSource>>();
const heldPlayerFlags = new Map<number, Set<InputSource>>();
const flashOwners = new Set<InputSource>();
const clampControl = (value: number, min: number, max: number) =>
  Number.isFinite(value) && value !== 0
    ? Math.max(min, Math.min(max, value))
    : 0;

function mergedAnalog(): VehicleControlInput {
  const sources = [
    analogSources.keyboard,
    analogSources["touch-steering"],
    analogSources["touch-throttle"],
    analogSources["touch-pedals"],
    analogSources["touch-actions"],
    analogSources["touch-parking"],
    analogSources.gamepad,
  ];
  // An idle producer cannot erase another device. Keyboard wins deliberate
  // axis conflicts, then touch, then gamepad. Either device can apply brakes.
  return {
    throttle: sources.find((source) => source.throttle !== 0)?.throttle ?? 0,
    steer: sources.find((source) => source.steer !== 0)?.steer ?? 0,
    brake: Math.max(...sources.map((source) => source.brake)),
    handbrake: Math.max(...sources.map((source) => source.handbrake)),
  };
}

function updateHold(
  flags: Map<number, Set<InputSource>>,
  source: InputSource,
  flag: number,
  enabled: boolean,
) {
  let owners = flags.get(flag);
  if (!owners) flags.set(flag, (owners = new Set()));
  if (enabled) owners.add(source);
  else owners.delete(source);
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
  candump: boolean;
  liveCan: boolean;
  dyno: boolean;
  radio: boolean;
  honk: boolean;
  reset: boolean;
}

export interface InputPacket {
  type: "input";
  seq: number;
  dt: number;

  // analog controls (always present)
  throttle: number; // [-1..1]
  steer: number; // [-1..1]
  brake: number; // [0..1]
  handbrake: number; // [0..1]

  // bitmasks
  vehicleMask: number; // uint16
  playerMask: number; // uint16
  debug_mask?: number; // uint32, optional
  cockpit_mask?: number; // optional packed cockpit request; absent keeps legacy controls
  cabin_mask?: number; // climate/key v3, airflow/fan4 v5, held headlight flash v6
}
const defaultVehicleMask =
  VehicleFlags.ENGINE_ON | VehicleFlags.ABS | VehicleFlags.TCS;
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
  setMenuBrake: (enabled: boolean) => void;
  controls: VehicleControls;

  input: InputPacket;
  setInput: (partial: Partial<InputPacket>) => void;
  setCockpit: (patch: Partial<CockpitRequest>, command: CockpitCommand) => void;
  setAssist: (assist: number, traction: boolean) => void;
  setCabin: (patch: Partial<CabinState>, confirmed?: number) => void;
  setHeadlightFlash: (
    source: InputSource,
    held: boolean,
    confirmed?: number,
  ) => void;
  setIgnition: (
    position: number,
    inserted: boolean,
    confirmed?: number,
  ) => void;

  setAnalog: (partial: Partial<VehicleControlInput>) => void;
  releaseAnalog: () => void;
  setAnalogFromSource: (
    source: InputSource,
    partial: Partial<VehicleControlInput>,
  ) => void;
  releaseInputSource: (source: InputSource) => void;
  releaseControls: () => void;
  setHeldVehicleFlag: (
    source: InputSource,
    flag: number,
    enabled: boolean,
  ) => void;
  setHeldPlayerFlag: (
    source: InputSource,
    flag: number,
    enabled: boolean,
  ) => void;

  setVehicleFlag: (flag: number, enabled: boolean) => void;
  toggleVehicleFlag: (flag: number) => void;

  setPlayerFlag: (flag: number, enabled: boolean) => void;
  togglePlayerFlag: (flag: number) => void;
}

// Once acknowledged, confirmed selector state replaces stale request bits. A
// brake/lighting request must not revive a rejected gear or leave Neutral/Park.
function cockpitRequestBase(current: InputPacket) {
  const network = useNetworkStore.getState(),
    confirmed = network.connected ? network.getMe()?.cockpit_mask : undefined;
  if (
    confirmed === undefined ||
    !Number.isSafeInteger(confirmed) ||
    confirmed < 0 ||
    confirmed > 0xffffffff
  )
    return current.cockpit_mask;
  return current.cockpit_mask === undefined ||
    unpackCockpit(current.cockpit_mask).revision ===
      unpackCockpit(confirmed).revision
    ? confirmed
    : current.cockpit_mask;
}
export const useInputStore = create<InputState>((set, get) => ({
  setMenuBrake(enabled) {
    if (menuBrake === enabled) return;
    menuBrake = enabled;
    // Discard stale acceleration before returning to driving. Producers
    // must re-engage after a menu; their existing arming rules still apply.
    get().releaseControls();
  },
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
    if (menuBrake) {
      nextInput.throttle = 0;
      nextInput.steer = 0;
      nextInput.brake = 1;
    }
    if (
      nextInput.cockpit_mask !== undefined &&
      (!Number.isSafeInteger(nextInput.cockpit_mask) ||
        nextInput.cockpit_mask < 0 ||
        nextInput.cockpit_mask > 0xffffffff)
    )
      nextInput.cockpit_mask = previous.cockpit_mask;
    if (
      nextInput.cabin_mask !== undefined &&
      (!Number.isSafeInteger(nextInput.cabin_mask) ||
        nextInput.cabin_mask < 0 ||
        nextInput.cabin_mask > CABIN_MAX_MASK ||
        (nextInput.cabin_mask & 0xc000) !== 0)
    )
      nextInput.cabin_mask = previous.cabin_mask;
    // Polling the same held button must not broadcast another React update.
    if (
      (Object.keys(nextInput) as (keyof InputPacket)[]).every((key) =>
        Object.is(nextInput[key], previous[key]),
      )
    )
      return;

    inputRef.current = nextInput;

    // Zustand update only for UI/HUD/debug, not networking.
    set({
      input: nextInput,
      controls: deriveInputSignals(nextInput),
    });
  },

  setCockpit(patch, command) {
    const current = inputRef.current;
    const initial =
      cockpitRequestBase(current) ??
      reviseCockpit(
        undefined,
        {
          lights: hasFlag(current.vehicleMask, VehicleFlags.HEADLIGHTS) ? 2 : 0,
          assist: hasFlag(current.vehicleMask, VehicleFlags.TCS) ? 0 : 2,
        },
        0,
      );
    get().setInput({ cockpit_mask: reviseCockpit(initial, patch, command) });
  },
  setAssist(assist, traction) {
    const current = inputRef.current;
    const initial =
      cockpitRequestBase(current) ??
      reviseCockpit(
        undefined,
        {
          lights: hasFlag(current.vehicleMask, VehicleFlags.HEADLIGHTS) ? 2 : 0,
        },
        0,
      );
    get().setInput({
      vehicleMask: setFlag(current.vehicleMask, VehicleFlags.TCS, traction),
      cockpit_mask: reviseCockpit(initial, { assist }, 1),
    });
  },
  setCabin(patch, confirmed) {
    get().setInput({
      cabin_mask: reviseCabin(inputRef.current.cabin_mask ?? confirmed, patch),
    });
  },
  setHeadlightFlash(source, held, confirmed) {
    if (held) flashOwners.add(source);
    else flashOwners.delete(source);
    const current = inputRef.current.cabin_mask;
    if (current === undefined && !flashOwners.size) return;
    const cabin = reviseCabin(current ?? confirmed, {});
    get().setInput({
      cabin_mask: setFlag(cabin, HEADLIGHT_FLASH, flashOwners.size > 0),
    });
  },
  setIgnition(position, inserted, confirmed) {
    const current = inputRef.current;
    get().setInput({
      cabin_mask: reviseCabin(
        current.cabin_mask ?? confirmed,
        { ignition: position, keyInserted: inserted },
        true,
      ),
      vehicleMask: setFlag(
        current.vehicleMask,
        VehicleFlags.ENGINE_ON,
        inserted &&
          position >= 2 &&
          (position === 3 ||
            hasFlag(current.vehicleMask, VehicleFlags.ENGINE_ON)),
      ),
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
    for (const source of Object.keys(analogSources) as InputSource[])
      analogSources[source] = neutralControls();
    get().setInput(neutralControls());
  },
  setHeldVehicleFlag(source, flag, enabled) {
    get().setVehicleFlag(
      flag,
      updateHold(heldVehicleFlags, source, flag, enabled),
    );
  },
  setHeldPlayerFlag(source, flag, enabled) {
    get().setPlayerFlag(
      flag,
      updateHold(heldPlayerFlags, source, flag, enabled),
    );
  },
  releaseInputSource(source) {
    analogSources[source] = neutralControls();
    flashOwners.delete(source);
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
    const cabin = inputRef.current.cabin_mask;
    get().setInput({
      ...mergedAnalog(),
      vehicleMask,
      playerMask,
      ...(cabin === undefined
        ? {}
        : {
            cabin_mask: setFlag(cabin, HEADLIGHT_FLASH, flashOwners.size > 0),
          }),
    });
  },
  // Blur, disconnect and sender teardown release transient intent. Engine,
  // ABS/TCS, lights and research display toggles remain deliberate settings.
  releaseControls() {
    for (const source of Object.keys(analogSources) as InputSource[])
      analogSources[source] = neutralControls();
    heldVehicleFlags.clear();
    heldPlayerFlags.clear();
    flashOwners.clear();
    const cockpit = inputRef.current.cockpit_mask;
    const cabin = inputRef.current.cabin_mask;
    const releaseKey = cabin !== undefined && unpackCabin(cabin).ignition === 3;
    const stopCockpit =
      cockpit !== undefined &&
      ((cockpit & (1 << 12)) !== 0 || ((cockpit >>> 14) & 3) !== 3);
    get().setInput({
      ...neutralControls(),
      ...(cabin !== undefined
        ? {
            cabin_mask: releaseKey
              ? reviseCabin(cabin & ~HEADLIGHT_FLASH, { ignition: 2 }, true)
              : cabin & ~HEADLIGHT_FLASH,
          }
        : {}),
      ...(stopCockpit
        ? {
            cockpit_mask: reviseCockpit(
              cockpit,
              { washer: false, cruiseAction: 3 },
              4,
            ),
          }
        : {}),
      vehicleMask: inputRef.current.vehicleMask & ~VehicleFlags.BOOST,
      playerMask:
        inputRef.current.playerMask & ~(PlayerFlags.HONK | PlayerFlags.RESET),
    });
  },

  setVehicleFlag(flag, enabled) {
    const current = inputRef.current.vehicleMask;
    const vehicleMask = setFlag(current, flag, enabled);

    const cockpit = inputRef.current.cockpit_mask;
    const cabin = inputRef.current.cabin_mask;
    get().setInput({
      vehicleMask,
      ...(flag === VehicleFlags.ENGINE_ON && cabin !== undefined
        ? {
            cabin_mask: reviseCabin(
              cabin,
              { ignition: enabled ? 3 : 0, keyInserted: true },
              true,
            ),
          }
        : {}),
      ...(cockpit === undefined
        ? {}
        : flag === VehicleFlags.TCS
          ? {
              cockpit_mask: reviseCockpit(
                cockpit,
                {
                  assist:
                    unpackCockpit(cockpit).assist === 1 ? 1 : enabled ? 0 : 2,
                },
                1,
              ),
            }
          : flag === VehicleFlags.HEADLIGHTS
            ? {
                cockpit_mask: reviseCockpit(
                  cockpit,
                  { lights: enabled ? 2 : 0 },
                  6,
                ),
              }
            : {}),
    });
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
