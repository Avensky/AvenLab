import { useEffect, useRef } from "react";
import { Group } from "three";

export function NetworkVehicleScene({ snapshot, playerId }) {
    const me = useRef<Group>(null);

    useEffect(() => {
        if (!snapshot || !playerId) return;

        const player = snapshot.players?.find((p) => p.id === playerId);
        if (!player) return;

        if (me.current) {
            me.current.position.set(player.x, player.y, player.z);
        }
    }, [snapshot, playerId]);

    return (
        <group ref={me}>
            <mesh>
                <boxGeometry args={[1, 1, 2]} />
                <meshStandardMaterial color="hotpink" />
            </mesh>
        </group>
    );
}
