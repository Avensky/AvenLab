// src/types/playerInput.ts
export interface PlayerInput {
    throttle: number;
    steer: number;
}

export interface PendingInput {
    seq: number;
    input: PlayerInput;
    dt: number;
}
