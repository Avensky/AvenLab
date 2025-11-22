// src/types.ts

export type Rapier = any;

export interface PlayerInput {
    throttle: number; // -1 (full reverse) .. 1 (full forward)
    steer: number;    // -1 (left) .. 1 (right)
}

export interface PlayerInputMessage extends PlayerInput {
    seq: number;      // client-side input sequence number
}
