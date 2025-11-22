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

export interface ServerSnapshot {
    timestamp: number;
    bodies: BodySnapshot[];
}
