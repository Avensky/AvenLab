// networkStore.ts   ← socket + snapshots + player identity
import { create } from "zustand";
import type { Team, VehicleKind } from "./types";

export interface PhysicsSnapshot {
  match_clock?: {
    remaining_s: number;
    phase: "regulation" | "overtime" | "ended";
  };
  server_timing?: { lock_ms: number; physics_ms: number; work_ms: number };
  tick: number; // Completed backend simulation tick, not a browser frame count.
  simulation_time_s?: number;
  tick_dt_s?: number;
  // Client-only receipt clock, stamped once at socket ingestion. Never sent to Rust.
  received_at_ms?: number;
  entities: PhysicsEntitySnapshot[];
}

export type PhysicsData = {
  speed: number;
  rpm: number;
  gear: number;
  fuel: number;
  temp: number;
  engineTorque: number;
  vehicleMask: number;
  playerMask: number;
  wheels?: WheelSnapshot[];
  // steeringValue: number
};

export type WheelId = "fl" | "fr" | "rl" | "rr";

export interface WheelSnapshot {
  id: WheelId;
  position: [number, number, number];
  rotation: [number, number, number, number];
  wheel_speed?: number; // rad/s is best for tire visual spin
  steer_angle?: number; // radians, useful for front wheel steering visual
  grounded?: boolean;
}

export interface VehicleColliderShape {
  nominal_wheel_center_y?: number; // Static body-local wheel plane at target sag.
  chassis_half_extents: [number, number, number];
  chassis_offset: [number, number, number];
  wheel_radius: number;
  wheel_count: number;
}

export interface PhysicsEntitySnapshot {
  collider?: VehicleColliderShape;
  id: string;
  kind: VehicleKind;
  /** Canonical selected model id, such as ae86, brz, camaro, or supra. */
  vehicle_id?: string | null;
  team?: Team;
  room_id: number;

  position: [number, number, number];
  rotation: [number, number, number, number];
  wheels?: WheelSnapshot[];

  // telemetry
  speed: number;
  rpm: number;
  gear: number;
  fuel: number;
  temp: number;
  engine_torque: number;

  // Optional availability contract for future drivetrain/resource models.
  // Missing mask means RPM/gear/fuel/temp are legacy placeholders, not readings.
  telemetry_mask?: number;
  boost_fraction?: number;
  condition?: number;
  ultimate_fraction?: number;
  resource_mask?: number;
  /** Optional confirmed lamp states; absent means the adapter does not supply them. */
  cluster_mask?: number;
  cockpit_mask?: number;
  parking_brake?: number; // v7 confirmed continuous cable latch, independent of P
  cabin_mask?: number;
  cruise_target_kph?: number | null;

  vehicle_mask: number;
  player_mask: number;
  /** Optional acknowledgement from the completed backend simulation tick. */
  last_input_seq?: number | null;
}

export interface PhysicsEntity {
  id: string; // entity id (player, AI, drone, etc.)
  kind: VehicleKind; // extensible
  team?: Team;
  physics: PhysicsData;
}

export interface DebugChassis {
  player_id: string;
  position: [number, number, number];
  rotation: [number, number, number, number]; // x,y,z,w
  half_extents: [number, number, number]; // hx,hy,hz
}

export interface DebugRay {
  player_id: string;
  origin: [number, number, number];
  direction: [number, number, number];
  length: number;
  hit?: [number, number, number];
  color: [number, number, number];
}

export interface DebugSlipRay {
  player_id: string;
  origin: [number, number, number];
  direction: [number, number, number];
  slip_angle: number;
  magnitude: number;
  color: [number, number, number];
}

export interface DebugWheel {
  player_id: string;
  id?: string; // Backend wheel identity; optional for older debug packets.
  center: [number, number, number];
  radius: number;
  grounded: boolean;
  compression: number;
  compression_ratio: number;
  normal_force: number;
  steering: boolean;
  drive: boolean;
  steer?: number;
  lateral_force?: [number, number, number];
  lateral_magnitude?: number;
  rotation: [number, number, number, number];
  wheel_speed: number; // radians per second
  steer_angle: number;
  v_long: number;
  v_lat: number;
  slip_angle: number;
  slip_ratio: number;
}

export interface DebugAabbBox {
  id: string;
  center: [number, number, number];
  half_extents: [number, number, number];
  kind: "road" | "intersection" | "building" | string;
  visual: string;
}

export interface DebugOverlay {
  chassis: DebugChassis[];
  suspension_rays: DebugRay[];
  slip_vectors: DebugSlipRay[];
  load_bars: DebugRay[];
  arb_links: DebugRay[];
  wheels: DebugWheel[];
  chassis_right: [number, number, number];
  block_boxes: DebugAabbBox[];
}

export interface NetworkState {
  // =======================================
  //  Net
  // =======================================
  connected: boolean;
  setConnected: (v: boolean) => void;
  resetSession: () => void;

  snapshot: PhysicsSnapshot | null;
  setSnapshot: (snap: PhysicsSnapshot, receivedMs?: number) => void;
  snapshotIntervalMs: number | null;
  pingMs: number | null;
  setPingMs: (ms: number) => void;

  physicsData: PhysicsData | null;
  setPhysicsData: (data: PhysicsData | null) => void;

  // =======================================
  //  Player Data
  // =======================================
  playerId: string;
  setPlayerId: (id: string) => void;

  team: Team;
  kind: string | null;
  room_id: number | null;
  spawn: [number, number, number] | null;
  x: number | null;
  y: number | null;
  z: number | null;

  tick: number | null;
  // lastTick: number | null;

  getMe: () => PhysicsEntitySnapshot | null;
  getOthers: () => PhysicsEntitySnapshot[];

  debugOverlay: DebugOverlay | null;
  debugTick: number | null;
  setDebugOverlay: (dbg: DebugOverlay, tick?: number) => void;
}

function telemetry(me: PhysicsEntitySnapshot | undefined): PhysicsData | null {
  return me
    ? {
        speed: me.speed,
        rpm: me.rpm,
        gear: me.gear,
        fuel: me.fuel,
        temp: me.temp,
        engineTorque: me.engine_torque,
        vehicleMask: me.vehicle_mask,
        playerMask: me.player_mask,
        wheels: me.wheels,
      }
    : null;
}

// Clearing a session is also what allows a restarted server to begin at tick zero.
// Keep actions out of this object so Zustand merges retain their stable identities.
const emptySession = {
  connected: false,
  snapshot: null,
  physicsData: null,
  playerId: "",
  team: "blue" as Team,
  kind: null,
  room_id: null,
  spawn: null,
  x: null,
  y: null,
  z: null,
  tick: null,
  debugOverlay: null,
  debugTick: null,
  snapshotIntervalMs: null,
  pingMs: null,
};

export const useNetworkStore = create<NetworkState>((set, get) => ({
  ...emptySession,
  resetSession: () => set({ ...emptySession }),
  setConnected: (connected) => {
    if (!connected) {
      get().resetSession();
      return;
    }
    if (!get().connected) set({ connected: true });
  },
  setSnapshot: (snap, receivedMs = performance.now()) => {
    const state = get();
    // WebSockets are ordered. This also catches duplicate store writes and
    // prevents a stale callback from rewinding HUD/raw rendering state.
    if (!Number.isSafeInteger(snap.tick) || snap.tick < 0) return;
    if (state.tick !== null && snap.tick <= state.tick) return;
    const previousReceipt = state.snapshot?.received_at_ms;
    const me = snap.entities.find((entity) => entity.id === state.playerId);
    set({
      snapshot: { ...snap, received_at_ms: receivedMs },
      tick: snap.tick,
      snapshotIntervalMs:
        previousReceipt === undefined ? null : receivedMs - previousReceipt,
      physicsData: telemetry(me),
    });
  },
  // Compatibility with older servers only. Once snapshots exist, their local
  // entity is the sole telemetry source; a second packet cannot overwrite it.
  setPhysicsData: (data) => {
    if (get().snapshot === null) set({ physicsData: data });
  },
  setPingMs: (pingMs) => set({ pingMs }),
  setPlayerId: (playerId) => {
    const me = get().snapshot?.entities.find(
      (entity) => entity.id === playerId,
    );
    set({ playerId, physicsData: telemetry(me) });
  },

  getMe() {
    const snap = get().snapshot;
    const id = get().playerId;
    if (!snap || !id) return null;
    return snap.entities.find((e) => e.id === id) ?? null;
  },
  getOthers() {
    const snap = get().snapshot;
    const id = get().playerId;
    if (!snap) return [];
    return snap.entities.filter((e) => e.id !== id);
  },

  setDebugOverlay: (debugOverlay, tick) => {
    const debugTick = Number.isSafeInteger(tick) && tick! >= 0 ? tick! : null;
    if (
      debugTick !== null &&
      get().debugTick !== null &&
      debugTick <= get().debugTick!
    )
      return;
    // Debug forces remain raw results. Retaining the envelope tick makes
    // their age relative to the buffered GLB vehicle visible in the menu.
    set({ debugOverlay, debugTick });
  },
}));
