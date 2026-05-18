import { useNetworkStore, useWorldStore, } from "../store";
import { DebugColliders } from "../components/debugger/DebugColliders";
import { BlueTeamBaseGround } from "./BlueTeamBaseGround";
import { CityChunk } from "./CityChunk";

export function CityScene() {
    
    // const activeBlock = useSnapshotStore((s) => s.activeBlock);
    const mode = useWorldStore((s) => s.mode);
    const debug = useNetworkStore((s) => s.debugOverlay);

    return (
        <group name="city-scene">
            {(mode === "collider" || mode === "hybrid") && debug && (
                <DebugColliders boxes={debug.block_boxes} />
            )}

            {(mode === "glb" || mode === "hybrid") && debug && (
                <CityChunk  chunkId="block_01" />
            )}

            <BlueTeamBaseGround />
        </group>
    );
}
