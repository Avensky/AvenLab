import { useEffect } from "react";
import { useSnapshotStore } from "../store/store";
import { socket, connectRustServer } from "../net/rustSocket";

export function usePlayerInput() {
    const setInput = useSnapshotStore((s) => s.setInput);
    connectRustServer();

    useEffect(() => {
        const interval = setInterval(() => {
            const input = useSnapshotStore.getState().input;
            if (!socket || socket.readyState !== WebSocket.OPEN) return;
            socket.send(JSON.stringify({ ...input }));
            // console.log('input', input)

        }, 1000 / 30);

        return () => clearInterval(interval);
    }, []);

    useEffect(() => {

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.code === "KeyW") setInput({ throttle: 1 });
            if (e.code === "KeyS") setInput({ throttle: -1 });
            if (e.code === "KeyA") setInput({ steer: -1 });
            if (e.code === "KeyD") setInput({ steer: 1 });
            if (e.code === "Space") setInput({ brake: 1 });
        };

        const handleKeyUp = (e: KeyboardEvent) => {

            // const i = inputRef.current;

            const input = useSnapshotStore.getState().input;

            if (e.code === "KeyW" && input.throttle > 0) setInput({ throttle: 0 });
            if (e.code === "KeyS" && input.throttle < 0) setInput({ throttle: 0 });
            if (e.code === "KeyA" && input.steer < 0) setInput({ steer: 0 });
            if (e.code === "KeyD" && input.steer > 0) setInput({ steer: 0 });
            if (e.code === "Space") setInput({ brake: 0 });
        }


        window.addEventListener("keydown", handleKeyDown);
        window.addEventListener("keyup", handleKeyUp);

        return () => {
            window.removeEventListener("keydown", handleKeyDown);
            window.removeEventListener("keyup", handleKeyUp);
        };
    }, []);
}
