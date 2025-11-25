// /src/net/rustSocket.ts
import { useSnapshotStore } from "../store/snapshotStore";

let socket: WebSocket | null = null;
let reconnectTimer: any = null;
let heartbeatTimer: any = null;

export function connectRustServer() {
    if (socket) return socket;

    // Zustand's built-in setter
    const set = useSnapshotStore.setState;

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
            clearInterval(heartbeatTimer);

            // Attempt reconnect in 1–3 seconds (random to avoid thundering herd)
            reconnectTimer = setTimeout(() => connect(), 1000 + Math.random() * 2000);

        };

        socket.onmessage = (event) => {
            let data: any;
            try {
                data = JSON.parse(event.data);
            } catch {
                console.warn("Bad JSON from server:", event.data);
                return;
            }
            console.log('data', data);

            // Pong heartbeat
            if (data.type === "pong") return;

            // Receive player ID
            if (data.type === "welcome") {
                set({ playerId: data.player_id });
                console.log("Registered player:", data.player_id);
                return;
            }

            // Snapshot
            if (data.players && typeof data.tick === "number") {
                set({
                    snapshot: data,
                    lastTick: data.tick,
                });
                return;
            }

            console.warn("Unknown message:", data);

            // try {
            //     const data = JSON.parse(event.data);

            //     // --- hearbeat ---
            //     if (data.type === "pong") return;

            //     // --- Welcome message ---
            //     if (data.type === "welcome") {
            //         set({ playerId: data.playerId });
            //         return;
            //     }

            //     // --- Snapshot ---
            //     if (data.players && typeof data.tick === "number") {
            //         set({
            //             snapshot: data,
            //             lastTick: data.tick,
            //         });
            //     }
            // } catch (err) {
            //     console.warn("Failed to parse physics message", err);
            // }
        };
    }

    if (!socket) connect();
    return socket;
}
