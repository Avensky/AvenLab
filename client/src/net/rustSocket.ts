// /src/net/rustSocket.ts
import { useSnapshotStore } from "../store/snapshotStore";

let socket: WebSocket | null = null;
let reconnectTimer: any = null;
let heartbeatTimer: any = null;

export function connectRustServer() {
    if (socket) return socket;

    // Zustand's built-in setter
    const set = useSnapshotStore.setState;
    const setSnapshot = useSnapshotStore.getState().setSnapshot;

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
                const { tick, players } = data.data;
                // console.log('data', data.data);

                setSnapshot({
                    players: Array.isArray(players) ? players : [],
                    tick: tick,
                });
                return;
            }
            console.warn("Unknown message type:", data.type);
        };
    }

    if (!socket) connect();
    return socket;
}
