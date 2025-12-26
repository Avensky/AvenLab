# AvenLab AI Coding Guidelines

## Architecture Overview
AvenLab is a real-time vehicle simulation with Rust physics backend and React Three Fiber frontend. Client connects via WebSocket to Rust server for deterministic multiplayer physics.

**Key Components:**
- `client/`: React/TypeScript frontend with Three.js visualization
- `physics-server/`: Rust server using Rapier physics, handles networking and simulation
- `server/`: Legacy Node.js server (currently unused)
- `shared/`: TypeScript types shared between client and server

**Data Flow:**
- Client sends input messages (`{type: "input", throttle, steer, ...}`) to Rust WebSocket server
- Rust server applies inputs, steps physics at 60Hz, broadcasts snapshots (`{type: "snapshot", data: {tick, players}}`)
- Client receives snapshots and updates Zustand store for rendering

## Development Workflows
- **Full dev setup:** `npm run dev` (runs client Vite + Rust cargo watch concurrently)
- **Client only:** `cd client && npm run dev`
- **Rust server only:** `cd physics-server && cargo watch -x run`
- **Build client:** `cd client && npm run build`
- **Build Rust:** `cd physics-server && cargo build`

## Code Patterns
- **State management:** Use Zustand store (`useSnapshotStore`) for client state; avoid Redux
- **Networking:** WebSocket messages as JSON with `type` field; client sends inputs, server sends snapshots/debug
- **Physics loop:** Fixed 16ms timestep in Rust main loop; apply inputs before stepping Rapier world
- **Visualization modes:** Switch between "glb", "geometry", "collider" in `ModeSwitcher` component
- **Shared types:** Define interfaces in `shared/types/` and import in both client/server

## Conventions
- **File structure:** Components in `client/src/components/`, scenes in `scenes/`, hooks in `hooks/`
- **Vehicle spawning:** Use `spawn.rs` for position allocation; attach Rapier bodies via `physics.spawn_vehicle_for_player()`
- **Debugging:** Physics server broadcasts debug overlays (rays, wheels) for visualization in `DebugVisualizer`
- **Input handling:** Client captures keyboard in `usePlayerInput` hook, sends to server immediately (no prediction)

## Dependencies
- **Client:** React 19, Three.js, @react-three/fiber, Zustand, WebSocket
- **Rust:** Rapier3D, Tokio, Tungstenite, Serde
- **Physics:** Deterministic simulation with Rapier; vehicles as rigid bodies with wheels/springs

Reference: `shared/types/physics.ts` for core interfaces, `physics-server/src/main.rs` for server loop, `client/src/App.tsx` for client structure.