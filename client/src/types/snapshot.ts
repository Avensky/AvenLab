// src/types/snapshot.ts
export interface BodySnapshot {
    id: string;
    x: number;
    y: number;
    z: number;
    qx: number;
    qy: number;
    qz: number;
    qw: number;
}

export interface ServerWorldSnapshot {
    tick: number;
    timestamp: number;
    bodies: BodySnapshot[];
}

export interface SnapshotMessage {
    world: ServerWorldSnapshot;
    yourBodyId: string;
    lastProcessedInputSeq: number;
}
