import type { PhysicsEntity } from "./store";

// src/types/snapshot.ts
export interface PhysicsSnapshot {
    type: "physics_snapshot";
    tick: number;               // authoritative sim tick
    serverTime: number;         // ms, optional but useful
    entities: Record<string, PhysicsEntity>;
}

export type PhysicsData = {
    speed: number
    rpm: number
    gear: number
    fuel: number
    temp: number
    engineTorque: number
    vehicleMask: number,
    playerMask: number,
    // steeringValue: number
}
