// shared/types/physics.ts
export type VehicleType = 'tank' | 'camaro' | 'frs' | 'debug';

// This is what the frontend receives every tick
export interface VehicleSnapshot {
    id: string;
    vehicleType: VehicleType;
    x: number;
    y: number;
    z: number;
    qx: number;
    qy: number;
    qz: number;
    qw: number;
    vx: number;
    vy: number;
    vz: number;
}

export interface WorldSnapshot {
    timestamp: number;
    vehicles: VehicleSnapshot[];
}

export interface VehicleInputState {
    throttle: number;   // 0..1
    brake: number;      // 0..1
    steer: number;      // -1..1
    handbrake: boolean;
}
