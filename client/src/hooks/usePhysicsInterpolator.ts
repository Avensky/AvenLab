// utils/physicsInterpolator.ts
import { useRef } from "react";
import { Quaternion, Vector3 } from "three";
import type {
  PhysicsEntitySnapshot,
  WheelSnapshot,
} from "../store/networkStore";

export interface InterpolatedWheelSnapshot extends WheelSnapshot {
  position: [number, number, number];
  rotation: [number, number, number, number];
}

export interface InterpolatedPhysicsSnapshot
  extends Omit<PhysicsEntitySnapshot, "position" | "rotation" | "wheels"> {
  position: [number, number, number];
  rotation: [number, number, number, number];
  wheels?: InterpolatedWheelSnapshot[];
}

type VehicleInterpolationState = {
  prev: PhysicsEntitySnapshot | null;
  next: PhysicsEntitySnapshot | null;
  lastUpdate: number;
};

function lerpVec3(
  a: [number, number, number],
  b: [number, number, number],
  t: number
): [number, number, number] {
  const v1 = new Vector3(a[0], a[1], a[2]);
  const v2 = new Vector3(b[0], b[1], b[2]);
  const out = v1.lerp(v2, t);
  return [out.x, out.y, out.z];
}

function slerpQuat(
  a: [number, number, number, number],
  b: [number, number, number, number],
  t: number
): [number, number, number, number] {
  const q1 = new Quaternion(a[0], a[1], a[2], a[3]);
  const q2 = new Quaternion(b[0], b[1], b[2], b[3]);
  const out = q1.slerp(q2, t);
  return [out.x, out.y, out.z, out.w];
}

function lerpNumber(a: number | undefined, b: number | undefined, t: number) {
  if (a === undefined) return b;
  if (b === undefined) return a;
  return a + (b - a) * t;
}

function interpolateWheels(
  prevWheels: WheelSnapshot[] | undefined,
  nextWheels: WheelSnapshot[] | undefined,
  t: number
): InterpolatedWheelSnapshot[] | undefined {
  if (!nextWheels) return undefined;
  if (!prevWheels) return nextWheels;

  return nextWheels.map((nextWheel) => {
    const prevWheel = prevWheels.find((w) => w.id === nextWheel.id);

    if (!prevWheel) {
      return nextWheel;
    }

    return {
      ...nextWheel,
      position: lerpVec3(prevWheel.position, nextWheel.position, t),
      rotation: slerpQuat(prevWheel.rotation, nextWheel.rotation, t),
      wheel_speed: lerpNumber(
        prevWheel.wheel_speed,
        nextWheel.wheel_speed,
        t
      ),
      steer_angle: lerpNumber(
        prevWheel.steer_angle,
        nextWheel.steer_angle,
        t
      ),
      grounded: nextWheel.grounded,
    };
  });
}

export function usePhysicsInterpolator(blendTime = 100) {
  const vehiclesRef = useRef<Record<string, VehicleInterpolationState>>({});

  function setSnapshot(id: string, snapshot: PhysicsEntitySnapshot) {
    const existing = vehiclesRef.current[id];

    if (!existing) {
      vehiclesRef.current[id] = {
        prev: null,
        next: snapshot,
        lastUpdate: Date.now(),
      };
      return;
    }

    existing.prev = existing.next;
    existing.next = snapshot;
    existing.lastUpdate = Date.now();
  }

  function setSnapshots(snapshots: PhysicsEntitySnapshot[]) {
    for (const entity of snapshots) {
      setSnapshot(entity.id, entity);
    }
  }

  function getInterpolated(id: string): InterpolatedPhysicsSnapshot | null {
    const state = vehiclesRef.current[id];
    if (!state?.next) return null;

    const now = Date.now();
    const t = Math.min((now - state.lastUpdate) / blendTime, 1);

    if (!state.prev) {
      return state.next;
    }

    return {
      ...state.next,
      position: lerpVec3(state.prev.position, state.next.position, t),
      rotation: slerpQuat(state.prev.rotation, state.next.rotation, t),
      wheels: interpolateWheels(state.prev.wheels, state.next.wheels, t),
    };
  }

  function clearVehicle(id: string) {
    delete vehiclesRef.current[id];
  }

  function clearAll() {
    vehiclesRef.current = {};
  }

  return {
    setSnapshot,
    setSnapshots,
    getInterpolated,
    clearVehicle,
    clearAll,
  };
}