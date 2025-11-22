import { useEffect } from "react";
import { socket } from "../net/socket";
import { useSnapshotStore } from "../store/snapshotStore";
import type { ServerSnapshot } from "../types/snapshot";

export function useSnapshot() {
    const setBodies = useSnapshotStore((s) => s.setBodies);

    useEffect(() => {
        socket.on("snapshot", (snapshot: ServerSnapshot) => {
            setBodies(snapshot.bodies);
        });

        return () => {
            socket.off("snapshot");
        };
    }, [setBodies]);
}
