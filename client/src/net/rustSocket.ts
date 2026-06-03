// /src/net/rustSocket.ts

import { useNetworkStore } from "../store";

let socket: WebSocket | null = null;

// eslint-disable-next-line @typescript-eslint/no-unused-vars
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

export function connectRustServer() {
    if (socket) return socket;

    // Zustand's built-in setter
    const set = useNetworkStore.setState;
    const setSnapshot = useNetworkStore.getState().setSnapshot;

    function connect() {

        socket = new WebSocket("ws://localhost:9001");

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
        };

        socket.onerror = () => {
            set({ connected: false });

            // Clean timers
            if (heartbeatTimer !== null) {
                clearInterval(heartbeatTimer);
                heartbeatTimer = null;
            }

            // Attempt reconnect in 1–3 seconds (random to avoid thundering herd)
            reconnectTimer = setTimeout(() => connect(), 1000 + Math.random() * 2000);

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