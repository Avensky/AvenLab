// /src/net/rustSocket.ts

import { useNetworkStore } from "../store";

let socket: WebSocket | null = null;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

function getRustWsUrl() {
    // Optional manual override from .env
    if (import.meta.env.VITE_RUST_WS_URL) {
        return import.meta.env.VITE_RUST_WS_URL;
    }

    // Vite dev mode: frontend on localhost:5173, Rust on localhost:9001
    if (import.meta.env.DEV) {
        return "ws://localhost:9001";
    }

    // Production: browser -> NGINX -> Rust
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${protocol}//${window.location.host}/ws/`;
}

export function connectRustServer() {
    if (socket) return socket;

    // Zustand's built-in setter
    const set = useNetworkStore.setState;
    const setSnapshot = useNetworkStore.getState().setSnapshot;

    function connect() {
        socket = new WebSocket(getRustWsUrl());

        socket.onopen = () => {
            console.log("Connected to Rust physics server");
            set({ connected: true });
            // Heartbeat every 5 seconds
            heartbeatTimer = setInterval(() => {
                if (socket?.readyState === WebSocket.OPEN) {
                    socket.send(JSON.stringify({ type: "ping" }));
                }
            }, 5000);
        };

        socket.onclose = () => {
            set({ connected: false });
            if (heartbeatTimer !== null) {
                clearInterval(heartbeatTimer);
                heartbeatTimer = null;
            }

            socket = null;

            setTimeout(connect, 1000 + Math.random() * 2000);
        };

        socket.onerror = () => {
            set({ connected: false });
            socket?.close();
        };

        socket.onmessage = (event) => {
            let data;
            try {
                data = JSON.parse(event.data);
            } catch {
                console.warn("Bad JSON from server:", event.data);
                return;
            }

            // Pong heartbeat
            if (data.type === "pong") return;

            // Receive player ID
            if (data.type === "welcome") {
                // console.log("Received data.player_id:", data.player_id);
                set({
                    playerId: data.player_id,
                    team: data.team,
                    room_id: data.room_id,
                    spawn: data.spawn,
                });
                return;
            }

            // Snapshot
            if (data.type === "snapshot") {
                const { tick, entities } = data.data;

                setSnapshot({
                    tick,
                    entities: Array.isArray(entities) ? entities : [],
                });
                return;
            }

            if (data.type === "physics") {
                useNetworkStore.getState().setPhysicsData(data.data);
                return;
            }

            // Debug overlay (raycasts, wheels, springs)
            if (data.type === "debug") {
                // Defensive checks
                if (!data.data) return;
                // console.log("[DEBUG OVERLAY]", data.data);
                useNetworkStore.getState().setDebugOverlay(data.data);
                return;
            }

            console.warn("Unknown message type:", data.type);
        };
    }

    if (!socket) connect();
    return socket;
}
export { socket };