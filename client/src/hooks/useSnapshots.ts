// src/hooks/useLiveSnapshots.ts
import { useEffect } from "react";
import { socket } from "../net/socket";
import { useSnapshotStore } from "../store/snapshotStore";
import type { SnapshotMessage } from "../types/snapshot";
import type { PredictedSelfState } from "../store/snapshotStore";
import type { PendingInput } from "../types/playerInput";

function integrateKinematic(
    base: PredictedSelfState,
    inputs: PendingInput[]
): PredictedSelfState {
    let state = { ...base };

    const accel = 20;      // tweak
    const drag = 2;        // tweak
    const steerRate = 2.5; // tweak

    let speed = 0;

    for (const { input, dt } of inputs) {
        // simple speed model
        speed += input.throttle * accel * dt;
        // drag
        speed -= speed * drag * dt;

        // yaw integration
        state.yaw += input.steer * steerRate * dt;

        // project motion in XZ plane
        const dx = Math.sin(state.yaw) * speed * dt;
        const dz = Math.cos(state.yaw) * speed * dt * -1;

        state.x += dx;
        state.z += dz;
    }

    return state;
}

export function useSnapshots() {
    const setBodies = useSnapshotStore((s) => s.setBodies);
    const setSelfId = useSnapshotStore((s) => s.setSelfId);
    const ackInputsUpTo = useSnapshotStore((s) => s.ackInputsUpTo);
    const setPredictedSelf = useSnapshotStore((s) => s.setPredictedSelf);
    const getState = useSnapshotStore; // access current state

    useEffect(() => {
        const handler = (msg: SnapshotMessage) => {
            const { world, yourBodyId, lastProcessedInputSeq } = msg;

            setBodies(world.bodies);
            setSelfId(yourBodyId);
            ackInputsUpTo(lastProcessedInputSeq);

            const state = getState.getState();
            const selfBody = world.bodies.find((b) => b.id === yourBodyId);
            if (!selfBody) {
                setPredictedSelf(null);
                return;
            }

            // base yaw from server quaternion (very rough; we'll just approximate)
            // In a real setup you'd convert quaternion -> yaw properly.
            const base: PredictedSelfState = {
                x: selfBody.x,
                y: selfBody.y,
                z: selfBody.z,
                yaw: 0 // assuming mostly upright, we let prediction yaw take over
            };

            const pending = state.pendingInputs;
            const predicted = integrateKinematic(base, pending);
            setPredictedSelf(predicted);
        };

        socket.on("snapshot", handler);
        return () => {
            socket.off("snapshot", handler);
        };
    }, [setBodies, setSelfId, ackInputsUpTo, setPredictedSelf]);
}
