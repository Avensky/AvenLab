// client/src/net/schema.ts
export type EntityKind = "Vehicle" | "Drone";

export interface WelcomeMessage {
    type: "welcome";
    playerId: string;
}

export interface InputAxes {
    throttle: number; // -1..1
    steer: number;    // -1..1
    ascend: number;   // -1..1 (for drones)
    yaw: number;
    pitch: number;
    roll: number;
}

export interface InputMessage {
    playerId: string;
    entityType: EntityKind;
    tick: number;
    axes: InputAxes;
}

export interface SnapshotPlayer {
    id: string;
    kind: EntityKind;
    x: number;
    y: number;
    z: number;
}

export interface SnapshotMessage {
    tick: number;
    players: SnapshotPlayer[];
}
