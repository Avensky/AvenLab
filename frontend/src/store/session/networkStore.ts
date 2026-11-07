// networkStore.ts   ← socket + snapshots + player identity
import { create } from "zustand";
import type { Team, VehicleKind } from "./types";

export interface CtfFlag {
  team: Team;
  base: [number, number, number];
  position: [number, number, number];
  status: "home" | "carried" | "dropped";
  carrier: string | null;
  return_remaining_s: number;
}
export interface CtfMatchState {
  match_id: string;
  mode: string;
  team_size?: 1 | 3 | 5;
  training: boolean;
  phase: "waiting" | "running" | "ended";
  elapsed_s: number;
  remaining_s: number;
  duration_s: number;
  captures_to_win: number;
  scores: { red: number; blue: number };
  flags: [CtfFlag, CtfFlag];
  winner: Team | null;
  /** Bounded authoritative objective history; optional for older servers. */
  events?: CtfFlagEvent[];
}
export interface CtfFlagEvent {
  seq: number;
  kind: "picked_up" | "dropped" | "returned" | "captured";
  flag_team: Team;
  player_id: string | null;
  elapsed_s: number;
}
export interface PhysicsSnapshot {
  match_state?: CtfMatchState | null;
  asset_health?: Record<string,number>;
  drawbridge?: {start_tick:number;start_angle:number;target_angle:number;next_available_tick?:number;broken:string|null};
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
  radius?: number;
  /** Contact XYZ, normal XYZ, modeled skid intensity. */
  tire_contact?: [number,number,number,number,number,number,number] | null;
}

export interface VehicleColliderShape {
  nominal_wheel_center_y?: number; // Static body-local wheel plane at target sag.
  chassis_half_extents: [number, number, number];
  chassis_offset: [number, number, number];
  wheel_radius: number;
  wheel_count: number;
}

export interface VehicleSessionStats {
  current_kill_streak?: number;
  best_kill_streak?: number;
  damage_dealt: number;
  healing_done: number;
  self_healing: number;
  gas_burned_liters: number;
  gas_gained_liters: number;
  assists: number;
  resurrections: number;
  respawns: number;
}

/** Authoritative support projectile state. A client only requests a launch;
 * target choice, flight, HP and cooldown all remain on the server. */
export interface HealthPackSnapshot {
  seq: number;
  target: string;
  origin: [number, number, number];
  position: [number, number, number];
  target_position: [number, number, number];
  remaining_s: number;
  duration_s: number;
  state: "flying" | "hit" | "missed";
  healed_hp: number;
}
export interface SupportSnapshot {
  cooldown_s: number;
  sequence: number;
  pack: HealthPackSnapshot | null;
}
export interface GuardSnapshot {
  panel?: [number, number, number, number];
  panel_yaw?: number;
  dive_remaining_s?: number;
  dive_cooldown_s?: number;
  kind?: "" | "brz_guard" | "tank_barrier";
  remaining_s: number;
  cooldown_s: number;
  shield_hp: number;
  shield_max_hp: number;
  break_seq: number;
}

export type TankBarrage = { ticks_left:number; pulse:number; traces:{from:[number,number,number];to:[number,number,number];cannon:boolean}[] };
export interface PhysicsEntitySnapshot {
  barrage?: TankBarrage;
  support?: SupportSnapshot;
  guard?: GuardSnapshot;
  /** Server-owned combat HP is separate from mechanical condition. */
  health?: {
    hp: number;
    max_hp: number;
    defeated: boolean;
    /** Optional recovery contract from the updated authoritative server. */
    disabled_reason?: "" | "combat" | "fuel";
    recovery_window_s?: number;
    revive_cooldown_s?: number;
    respawn_remaining_s: number;
    spawn_protection_s: number;
    damage_seq: number;
    last_attacker: string | null;
    last_damage: number;
    last_damage_kind: string;
    kills: number;
    deaths: number;
    /** Session totals from accepted server events, retained through respawn. */
    stats?: VehicleSessionStats;
  };
  combat?: {assisted_target?:string;shot_origin?:[number,number,number]|null;impact_normal?:[number,number,number]|null;impact_static?:boolean;shot_weapon?:string;stun_remaining?:number;ram_charge_remaining?:number;ram_blocked?:string;impact?:[number,number,number]|null;impact_time?:number;lock_yaw?:number;lock_pitch?:number;hull_locked?:boolean;ram_remaining?:number;ram_cooldown?:number;cannon_reload?:number;coax_reload?:number;basket_reload?:number;cannon_shot?:number;weapon?:string;shot?:number;ammo?:number;reload?:number;fire?:boolean;enabled:boolean;yaw:number;pitch:number;x:number;y:number;z:number;role:string};
  collider?: VehicleColliderShape;
  id: string;
  kind: VehicleKind;
  /** Canonical selected model id, such as ae86, brz, camaro, or supra. */
  vehicle_id?: string | null;
  appearance?: import("../../vehicles/cosmetics/heroLoadouts").HeroAppearance;
  team?: Team;
  room_id: number;

  position: [number, number, number];
  rotation: [number, number, number, number];
  wheels?: WheelSnapshot[];

  // telemetry
  speed: number;
  rpm: number;
  gear: number;
  fuel?: number;
  temp?: number;
  engine_torque?: number;

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
  tire?: [number, number]; // tread temperature °C and gauge PSI, only when enabled
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
  resetWorld: () => void;

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
  worldMap: string | null;
  worldName: string | null;
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
  worldMap: null,
  worldName: null,
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

// Each received frame is immutable. HUD, camera, shields and vehicle visuals
// share this lookup; old frames and their indices are collected together.
const entityIndices = new WeakMap<PhysicsSnapshot, Map<string, PhysicsEntitySnapshot>>();
export function snapshotEntity(snapshot: PhysicsSnapshot | null | undefined, id: string | null | undefined) {
  if (!snapshot || !id) return undefined;
  let index = entityIndices.get(snapshot);
  if (!index) {
    index = new Map();
    for (const entity of snapshot.entities) if (!index.has(entity.id)) index.set(entity.id, entity);
    entityIndices.set(snapshot, index);
  }
  return index.get(id);
}

export const useNetworkStore = create<NetworkState>((set, get) => ({
  ...emptySession,
  resetSession: () => set({ ...emptySession }),
  // World ticks restart independently. Retain this socket/player identity while
  // discarding poses, diagnostics and acknowledgements from the previous world.
  resetWorld: () =>
    set({
      snapshot: null,
      physicsData: null,
      tick: null,
      debugOverlay: null,
      debugTick: null,
      spawn: null,
      snapshotIntervalMs: null,
    }),
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
    const received = { ...snap, received_at_ms: receivedMs };
    set({
      snapshot: received,
      tick: snap.tick,
      snapshotIntervalMs:
        previousReceipt === undefined ? null : receivedMs - previousReceipt,
      physicsData: null, // legacy fallback only; gauges read their sampled store
    });
  },
  // Compatibility with older servers only. Once snapshots exist, their local
  // entity is the sole telemetry source; a second packet cannot overwrite it.
  setPhysicsData: (data) => {
    if (get().snapshot === null) set({ physicsData: data });
  },
  setPingMs: (pingMs) => set({ pingMs }),
  setPlayerId: (playerId) => {
    if (get().playerId!==playerId) set({playerId});
  },

  getMe() {
    const state = get();
    return snapshotEntity(state.snapshot, state.playerId) ?? null;
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
