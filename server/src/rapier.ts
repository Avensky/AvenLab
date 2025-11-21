// src/rapier.ts

// @ts-ignore
import * as RAPIER from "@dimforge/rapier3d/rapier.js?init";

// Vite (with wasm plugin) initializes the WASM automatically.
// Rapier becomes ready immediately.
export async function loadRapier() {
    // @ts-ignore
    return RAPIER;
}