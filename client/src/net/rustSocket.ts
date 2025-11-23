import { useSnapshotStore } from "../store/snapshotStore";

let socket: WebSocket | null = null;

export function connectRustServer() {
    if (socket) return socket;

    // Zustand's built-in setter
    const set = useSnapshotStore.setState;

    socket = new WebSocket("ws://localhost:9001");

    socket.onopen = () => {
        console.log("Connected to Rust physics server");
        set({ connected: true });
    };

    socket.onclose = () => {
        set({ connected: false });
    };

    socket.onerror = () => {
        set({ connected: false });
    };

    socket.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);

            // --- Welcome message ---
            if (data.type === "welcome") {
                set({ playerId: data.playerId });
                return;
            }

            // --- Snapshot ---
            if (data.players && typeof data.tick === "number") {
                set({
                    snapshot: data,
                    lastTick: data.tick,
                });
            }

        } catch (err) {
            console.warn("Failed to parse physics message", err);
        }
    };

    return socket;
}
