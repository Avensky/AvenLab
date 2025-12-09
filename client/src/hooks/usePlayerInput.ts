import { useEffect, useRef } from "react";
import { socket, connectRustServer } from "../net/rustSocket";

export function usePlayerInput() {
    const inputRef = useRef({ throttle: 0, steer: 0 });

    useEffect(() => {
        connectRustServer();

        const handleKeyDown = (e: KeyboardEvent) => {
            const i = inputRef.current;
            if (e.code === "KeyW") i.throttle = 1;
            if (e.code === "KeyS") i.throttle = -1;
            if (e.code === "KeyA") i.steer = -1;
            if (e.code === "KeyD") i.steer = 1;
        };

        const handleKeyUp = (e: KeyboardEvent) => {
            const i = inputRef.current;
            if (e.code === "KeyW" && i.throttle > 0) i.throttle = 0;
            if (e.code === "KeyS" && i.throttle < 0) i.throttle = 0;
            if (e.code === "KeyA" && i.steer < 0) i.steer = 0;
            if (e.code === "KeyD" && i.steer > 0) i.steer = 0;
        };

        window.addEventListener("keydown", handleKeyDown);
        window.addEventListener("keyup", handleKeyUp);

        const loop = setInterval(() => {
            if (!socket || socket.readyState !== WebSocket.OPEN) return;

            socket.send(JSON.stringify({
                type: "input",
                throttle: inputRef.current.throttle,
                steer: inputRef.current.steer,
                ascend: 0,
                pitch: 0,
                yaw: 0,
                roll: 0
            }));
        }, 1000 / 30);

        return () => {
            window.removeEventListener("keydown", handleKeyDown);
            window.removeEventListener("keyup", handleKeyUp);
            clearInterval(loop);
        };
    }, []);
}
