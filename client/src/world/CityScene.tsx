import { useNetworkStore, useWorldStore, } from "../store";
import { DebugColliders } from "../components/debugger/DebugColliders";
import { BlueTeamBaseGround } from "./BlueTeamBaseGround";
import { CityChunk } from "./CityChunk";
import { Environment } from "@react-three/drei";

export function CityScene() {

    // const activeBlock = useSnapshotStore((s) => s.activeBlock);
    const mode = useWorldStore((s) => s.mode);
    const debug = useNetworkStore((s) => s.debugOverlay);

    return (
        <group name="city-scene">

            {/* Lighting */}
            {/* <ambientLight intensity={0.1} /> */}
            <Environment preset="night" />
            {/* <directionalLight intensity={1.2} psosition={[10, 20, 10]} /> */}

            {(mode === "collider" || mode === "hybrid") && debug && (
                <DebugColliders boxes={debug.block_boxes} />
            )}

            {(mode === "glb" || mode === "hybrid") && debug && (
                <CityChunk chunkId="block_01" />
            )}

            <BlueTeamBaseGround />
        </group>
    );
}
