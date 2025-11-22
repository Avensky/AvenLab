import { useEffect } from "react";
import { useSnapshotStore } from "../store/snapshotStore";
import type { ServerSnapshot } from "../types/snapshot";

export function useSnapshot() {
    const setBodies = useSnapshotStore((s) => s.setBodies);

    useEffect(() => {
        const interval = setInterval(async () => {
            const res = await fetch("http://localhost:4000/snapshot");
            const data: ServerSnapshot = await res.json();
            setBodies(data.bodies);
        }, 1000 / 30); // 30 Hz polling

        return () => clearInterval(interval);
    }, [setBodies]);
}
