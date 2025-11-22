// src/hooks/usePlayerInput.ts
import { useEffect, useRef } from "react";
import { socket } from "../net/socket";
import { useSnapshotStore } from "../store/snapshotStore";
import type { PlayerInput } from "../types/playerInput";

export function usePlayerInput() {
    const addPendingInput = useSnapshotStore((s) => s.addPendingInput);

    const inputRef = useRef<PlayerInput>({ throttle: 0, steer: 0 });
    const seqRef = useRef(0);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            const input = { ...inputRef.current };

            if (e.code === "KeyW") input.throttle = 1;
            if (e.code === "KeyS") input.throttle = -1;
            if (e.code === "KeyA") input.steer = -1;
            if (e.code === "KeyD") input.steer = 1;

            inputRef.current = input;
        };

        const handleKeyUp = (e: KeyboardEvent) => {
            const input = { ...inputRef.current };

            if (e.code === "KeyW" && input.throttle > 0) input.throttle = 0;
            if (e.code === "KeyS" && input.throttle < 0) input.throttle = 0;
            if (e.code === "KeyA" && input.steer < 0) input.steer = 0;
            if (e.code === "KeyD" && input.steer > 0) input.steer = 0;

            inputRef.current = input;
        };

        window.addEventListener("keydown", handleKeyDown);
        window.addEventListener("keyup", handleKeyUp);

        const sendInterval = setInterval(() => {
            seqRef.current += 1;
            const seq = seqRef.current;
            const dt = 1 / 30; // input send rate

            const input = { ...inputRef.current };

            // buffer locally for prediction
            addPendingInput({ seq, input, dt });

            // send to server
            socket.emit("input", { seq, ...input });
        }, 1000 / 30);

        return () => {
            window.removeEventListener("keydown", handleKeyDown);
            window.removeEventListener("keyup", handleKeyUp);
            clearInterval(sendInterval);
        };
    }, [addPendingInput]);
}
