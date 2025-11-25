import { useSnapshotStore } from "../store/snapshotStore";
import { useEffect, useRef } from "react";
import { Group } from "three";

export function NetworkVehicleScene() {
    const ref = useRef<Group>(null);
    const playerId = useSnapshotStore(s => s.playerId);
    const snapshot = useSnapshotStore(s => s.snapshot);
    const me = snapshot?.players?.find(p => p.id === playerId);

    useEffect(() => {
        if (!me || !ref.current) return;
        ref.current.position.set(me.x, me.y, me.z);
    }, [me]);

    useEffect(() => {
        if (me && ref.current) {
            ref.current.position.set(me.x, me.y, me.z);
        }
    }, [me]);

    if (!me) return null;

    return (
        <group ref={ref}>
            <mesh>
                <boxGeometry args={[1, 1, 2]} />
                <meshStandardMaterial color="hotpink" />
            </mesh>
        </group>
    );
}
