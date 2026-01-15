// src/types/playerInput.ts

export interface VehicleControls {
    braking: boolean
    accelerating: boolean
    reversing: boolean
    coasting: boolean
    absActive?: boolean
    tractionControl?: boolean
}

export interface VehicleControlInput {
    type: "vehicle_control"
    throttle: number     // [-1..1]
    steer: number        // [-1..1]
    brake: number        // [0..1]
    handbrake: number
    // ascend: number;
    // pitch: number;
    // yaw: number;
    // roll: number;
}

export interface VehicleStateInput {
    type: "vehicle_state"
    engineOn?: boolean
    headlights?: boolean
    blinkerLeft?: boolean
    blinkerRight?: boolean
    hazards?: boolean
    abs?: boolean
    tcs?: boolean
}

export interface PlayerStateInput {
    type: "player_state"
    boost: boolean,
    candump: boolean,
    liveCan: boolean,
    dyno: boolean,
    radio: boolean,
    honk: boolean,
    reset: boolean,
}

export interface Input {
    control: VehicleControlInput,
    vehicle: VehicleStateInput,
    player: PlayerStateInput,
}

export interface PendingInput {
    seq: number;
    input: PlayerStateInput;
    dt: number;
}
