// src/types/playerInput.ts
export interface PlayerInput {
    type: string;

    throttle: number; // -1..1
    steer: number;    // -1..1
    brake: number;    // 0..1

    ascend: number;
    pitch: number;
    yaw: number;
    roll: number;
}

export interface PendingInput {
    seq: number;
    input: PlayerInput;
    dt: number;
}
