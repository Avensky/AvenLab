import { useConnectionView, useMotionView } from "../store/session/networkViews";
// Render completed backend poses on a short timeline; never simulate forces here.
import { useCallback, useEffect, useRef } from "react";
import { blendCombatAim, blendYaw } from '../combat/turretPresentation';
import { Quaternion } from "three";
import { useDebugViewStore } from "../store/presentation/debugViewStore";
import {
  snapshotEntity, useNetworkStore,
  type PhysicsSnapshot,
  type PhysicsEntitySnapshot,
  type WheelSnapshot,
} from "../store/session/networkStore";

// Three 60 Hz ticks provide a small buffer without the old 100 ms setting.
// Increase this single value if measured network jitter regularly empties it.
export const DEFAULT_INTERPOLATION_DELAY_MS = 50;
const MAX_HISTORY = 64;
const STALE_GAP_MS = 250;

// Optional additive backend fields keep this compatible with older store types.
export interface SnapshotTiming {
  tick?: number;
  simulation_time_s?: number;
  tick_dt_s?: number;
  received_at_ms?: number;
}

export interface InterpolatedWheelSnapshot extends WheelSnapshot {
  position: [number, number, number];
  rotation: [number, number, number, number];
}

export interface InterpolatedPhysicsSnapshot extends Omit<
  PhysicsEntitySnapshot,
  "position" | "rotation" | "wheels"
> {
  position: [number, number, number];
  rotation: [number, number, number, number];
  wheels?: InterpolatedWheelSnapshot[];
}

type TimedPose = { timeMs: number; pose: PhysicsEntitySnapshot };
type History = {
  frames: TimedPose[];
  lastTick?: number;
  lastServerMs?: number;
  lastReceivedMs: number;
  serverOriginMs?: number;
  localOriginMs: number;
  renderDelayMs?: number;
};

// A snapshot shared by several models gets one receipt timestamp, even when
// their effects run at slightly different times. Weak keys cannot retain games.
const receiptTimes = new WeakMap<object, number>();

function receiptTime(key: object, now: number) {
  const existing = receiptTimes.get(key);
  if (existing !== undefined) return existing;
  receiptTimes.set(key, now);
  return now;
}

function lerpVec3(
  a: [number, number, number],
  b: [number, number, number],
  t: number,
): [number, number, number] {
  // Arithmetic avoids allocating temporary Vector3 objects for every wheel.
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ];
}

function slerpQuat(
  a: [number, number, number, number],
  b: [number, number, number, number],
  t: number,
): [number, number, number, number] {
  const result: [number, number, number, number] = [0, 0, 0, 1];
  Quaternion.slerpFlat(result, 0, a, 0, b, 0, t);
  return result;
}

function lerpNumber(a: number | undefined, b: number | undefined, t: number) {
  if (a === undefined) return b;
  if (b === undefined) return a;
  return a + (b - a) * t;
}

function interpolateWheels(
  a: WheelSnapshot[] | undefined,
  b: WheelSnapshot[] | undefined,
  t: number,
): InterpolatedWheelSnapshot[] | undefined {
  if (!b) return undefined;
  if (!a) return b;
  // Rust sends stable wheel order. Match by ID only if a legacy snapshot
  // changes casing, reorders axles or supplies a different wheel count.
  return b.map((wheel,index) => {
    const prior = a[index];
    const prev = prior?.id === wheel.id ? prior : a.find(item=>item.id.toLowerCase()===wheel.id.toLowerCase());
    if (!prev) return wheel;
    return {
      ...wheel,
      position: lerpVec3(prev.position, wheel.position, t),
      rotation: slerpQuat(prev.rotation, wheel.rotation, t),
      wheel_speed: lerpNumber(prev.wheel_speed, wheel.wheel_speed, t),
      steer_angle: lerpNumber(prev.steer_angle, wheel.steer_angle, t),
      // Contact is a discrete backend result, not a frontend collision test.
      grounded: t < 1 ? prev.grounded : wheel.grounded,
    };
  });
}

// Exported separately from React so cadence, loss and ordering can be tested.
export class PhysicsInterpolationBuffer {
  private readonly histories = new Map<string, History>();

  private readonly now: () => number;

  constructor(now = () => performance.now()) {
    this.now = now;
  }

  setSnapshot(
    id: string,
    pose: PhysicsEntitySnapshot,
    timing?: SnapshotTiming,
  ) {
    let history = this.histories.get(id);
    const prior=history?.frames.at(-1)?.pose;
    if (prior && (prior.room_id!==pose.room_id || prior.vehicle_id!==pose.vehicle_id)) history=undefined;
    const last = history?.frames[history.frames.length - 1];
    const tick = Number.isFinite(timing?.tick) ? timing?.tick : undefined;
    // Re-renders and late packets must not reset the clock or replay a pose.
    if (last?.pose === pose) return;
    if (
      tick !== undefined &&
      history?.lastTick !== undefined &&
      tick <= history.lastTick
    )
      return;

    // Socket receipt time is independent of when React commits this component.
    const receivedMs =
      timing?.received_at_ms ?? receiptTime(timing ?? pose, this.now());
    const dt = timing?.tick_dt_s;
    const serverMs = Number.isFinite(timing?.simulation_time_s)
      ? timing!.simulation_time_s! * 1000
      : tick !== undefined
        ? tick *
          (dt !== undefined && dt > 0 && Number.isFinite(dt) ? dt : 1 / 60) *
          1000
        : undefined;
    if (
      serverMs !== undefined &&
      history?.lastServerMs !== undefined &&
      serverMs <= history.lastServerMs
    )
      return;

    // After a long delivery/server pause, show the fresh state and start a new
    // short buffer. Playing an old backlog would add visible input latency.
    if (
      !history ||
      receivedMs - history.lastReceivedMs > STALE_GAP_MS
    ) {
      history = {
        frames: [],
        lastReceivedMs: receivedMs,
        localOriginMs: receivedMs,
        serverOriginMs: serverMs,
      };
      this.histories.set(id, history);
    }

    // Preserve server tick spacing: a burst of socket arrivals is not a burst
    // of simulated time. Legacy callers without timing use monotonic receipts.
    let timeMs =
      serverMs !== undefined && history.serverOriginMs !== undefined
        ? history.localOriginMs + serverMs - history.serverOriginMs
        : receivedMs;
    // Skipped server ticks or a change in delivery latency can move this clock
    // beyond the buffer's headroom, even without one long socket gap. Reanchor
    // to the fresh pose and discard older frames so recovery cannot rewind it.
    const driftLimitMs = Math.max(
      history.renderDelayMs ?? DEFAULT_INTERPOLATION_DELAY_MS,
      1000 / 60,
    );
    if (
      serverMs !== undefined &&
      Math.abs(receivedMs - timeMs) >= driftLimitMs
    ) {
      history.frames = [];
      history.serverOriginMs = serverMs;
      history.localOriginMs = receivedMs;
      timeMs = receivedMs;
    }
    history.frames.push({ timeMs, pose });
    history.lastTick = tick;
    history.lastServerMs = serverMs;
    history.lastReceivedMs = receivedMs;
    if (history.frames.length > MAX_HISTORY) history.frames.shift();
  }

  getInterpolated(
    id: string,
    delayMs = DEFAULT_INTERPOLATION_DELAY_MS,
    nowMs = this.now(),
  ): InterpolatedPhysicsSnapshot | null {
    const history = this.histories.get(id);
    if (!history?.frames.length) return null;
    history.renderDelayMs = Math.max(0, delayMs);
    const targetMs = nowMs - Math.max(0, delayMs);
    const frames = history.frames;

    // Sampling does not consume history: the camera and models can read it in
    // either order. Appending already bounds history to MAX_HISTORY frames.
    let index = 0;
    while (index < frames.length - 2 && frames[index + 1].timeMs <= targetMs)
      index++;
    const a = frames[index];
    if (targetMs <= a.timeMs || frames.length === 1) return a.pose;
    const b = frames[index + 1];
    // Buffer underrun holds the latest authoritative pose. No velocity
    // prediction, wheel height correction, or later snap-back is introduced.
    if (targetMs >= b.timeMs) return b.pose;
    const t = (targetMs - a.timeMs) / (b.timeMs - a.timeMs);
    let wheels: InterpolatedWheelSnapshot[] | undefined;
    return {
      ...b.pose,
      position: lerpVec3(a.pose.position, b.pose.position, t),
      rotation: slerpQuat(a.pose.rotation, b.pose.rotation, t),
      combat: blendCombatAim(a.pose.combat,b.pose.combat,t),
      guard: a.pose.guard?.panel_yaw !== undefined && b.pose.guard?.panel_yaw !== undefined
        ? {...b.pose.guard, panel_yaw:blendYaw(a.pose.guard.panel_yaw,b.pose.guard.panel_yaw,t)}
        : b.pose.guard,
      // Batched exteriors and aim markers read only the chassis. The local rig
      // and wheel debugger still share a fully interpolated set when requested.
      get wheels() { return wheels ??= interpolateWheels(a.pose.wheels, b.pose.wheels, t); },
    };
  }

  clearVehicle(id: string) {
    this.histories.delete(id);
  }
  clearAll() {
    this.histories.clear();
  }
}

export function usePhysicsInterpolator(
  delayMs = DEFAULT_INTERPOLATION_DELAY_MS,
) {
  const bufferRef = useRef<PhysicsInterpolationBuffer | null>(null);
  // React recognizes this explicit null guard as one-time ref initialization.
  if (bufferRef.current === null) {
    bufferRef.current = new PhysicsInterpolationBuffer();
  }
  const setSnapshot = useCallback(
    (id: string, pose: PhysicsEntitySnapshot, timing?: SnapshotTiming) => {
      bufferRef.current!.setSnapshot(id, pose, timing);
    },
    [],
  );
  const setSnapshots = useCallback(
    (poses: PhysicsEntitySnapshot[], timing?: SnapshotTiming) => {
      for (const pose of poses)
        bufferRef.current!.setSnapshot(pose.id, pose, timing);
    },
    [],
  );
  const getInterpolated = useCallback(
    (id: string) => bufferRef.current!.getInterpolated(id, delayMs),
    [delayMs],
  );
  const clearVehicle = useCallback(
    (id: string) => bufferRef.current!.clearVehicle(id),
    [],
  );
  const clearAll = useCallback(() => bufferRef.current!.clearAll(), []);
  return { setSnapshot, setSnapshots, getInterpolated, clearVehicle, clearAll };
}

// One live subscription feeds one shared history for every vehicle and camera.
// React effects retain it; no network subscription is created during render.
const vehicleBuffer = new PhysicsInterpolationBuffer();
let consumers = 0;
let unsubscribeNetwork: (() => void) | null = null;
let blockedSnapshot: PhysicsSnapshot | null = null;
let lastSnapshot: PhysicsSnapshot | null = null;
let knownIds = new Set<string>();
let renderTimeMs: number | null = null;
const framePoses = new Map<string, InterpolatedPhysicsSnapshot | null>();

// Cameras calls this at priority -100, before camera (-1) and model (0) reads.
// A single timestamp and cached result keep their world transforms together.
export function beginVehicleRenderFrame(nowMs = performance.now()) {
  renderTimeMs = nowMs;
  framePoses.clear();
}

export function releaseVehicleRenderFrameClock() {
  renderTimeMs = null;
  framePoses.clear();
}

function clearVehicleHistory() {
  vehicleBuffer.clearAll();
  knownIds.clear();
  framePoses.clear();
}

function ingestVehicles() {
  const { connected, snapshot } = useNetworkStore.getState();
  if (!connected) {
    blockedSnapshot = snapshot;
    lastSnapshot = null;
    clearVehicleHistory();
    return;
  }
  if (!snapshot) {
    lastSnapshot = null;
    clearVehicleHistory();
    return;
  }
  if (snapshot === blockedSnapshot || snapshot === lastSnapshot) return;
  const before = lastSnapshot?.match_state, after = snapshot.match_state;
  if (after?.phase === "running" && (before?.phase !== "running" || before.match_id !== after.match_id)) {
    clearVehicleHistory();
  }
  lastSnapshot = snapshot;
  const nextIds = new Set<string>();
  for (const entity of snapshot.entities) {
    nextIds.add(entity.id);
    vehicleBuffer.setSnapshot(entity.id, entity, snapshot);
  }
  for (const id of knownIds)
    if (!nextIds.has(id)) vehicleBuffer.clearVehicle(id);
  knownIds = nextIds;
  framePoses.clear();
}

function retainVehicleTimeline() {
  if (consumers++ === 0) {
    const state = useNetworkStore.getState();
    blockedSnapshot = state.connected ? null : state.snapshot;
    lastSnapshot = null;
    unsubscribeNetwork = useMotionView.subscribe(ingestVehicles);
    ingestVehicles();
  }
  return () => {
    if (--consumers === 0) {
      unsubscribeNetwork?.();
      unsubscribeNetwork = null;
      blockedSnapshot = lastSnapshot = null;
      clearVehicleHistory();
      releaseVehicleRenderFrameClock();
    }
  };
}

function framePose(requestedId:string,delayMs=DEFAULT_INTERPOLATION_DELAY_MS):InterpolatedPhysicsSnapshot|null {
  const state = useNetworkStore.getState();
  if (
    !state.connected ||
    state.snapshot === blockedSnapshot
  )
    return null;
  // GLB, collider and geometry poses share the selected timeline and camera.
  // Force/ray diagnostics remain raw backend results; OFF exposes raw poses.
  const raw = !useDebugViewStore.getState().interpolationEnabled;
  const key = (raw ? "raw:" : "") + delayMs + ":" + requestedId;
  if (renderTimeMs !== null && framePoses.has(key))
    return framePoses.get(key)!;
  const pose = raw
    ? (snapshotEntity(state.snapshot, requestedId) ?? null)
    : vehicleBuffer.getInterpolated(
        requestedId,
        delayMs,
        renderTimeMs ?? performance.now(),
      );
  if (renderTimeMs !== null) framePoses.set(key, pose);
  return pose;
}

/** Instanced fleet draws share the very same frame pose as markers and weapons. */
export function useFleetPoseReader(){
  useEffect(retainVehicleTimeline,[]);
  return framePose;
}

export function useVehiclePhysicsInterpolator(
  entityId?: string,
  delayMs = DEFAULT_INTERPOLATION_DELAY_MS,
) {
  const playerId = useConnectionView(state => state.playerId);
  const id = entityId ?? playerId;
  useEffect(retainVehicleTimeline, []);

  const getInterpolated=useCallback((requestedId:string)=>requestedId===id ? framePose(id,delayMs) : null,[id,delayMs]);

  const setSnapshot = useCallback(
    (entity: string, pose: PhysicsEntitySnapshot, timing?: SnapshotTiming) => {
      vehicleBuffer.setSnapshot(entity, pose, timing);
      framePoses.clear();
    },
    [],
  );
  const setSnapshots = useCallback(
    (poses: PhysicsEntitySnapshot[], timing?: SnapshotTiming) => {
      for (const pose of poses)
        vehicleBuffer.setSnapshot(pose.id, pose, timing);
      framePoses.clear();
    },
    [],
  );
  const clearVehicle = useCallback((entity: string) => {
    vehicleBuffer.clearVehicle(entity);
    framePoses.clear();
  }, []);
  const clearAll = useCallback(() => clearVehicleHistory(), []);
  return { setSnapshot, setSnapshots, getInterpolated, clearVehicle, clearAll };
}
