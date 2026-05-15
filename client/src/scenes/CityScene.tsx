// import { useGLTF } from "@react-three/drei";
// import { useEffect} from "react";
import { useSnapshotStore } from "../store/store";
// import { BlockColliderVisualizer } from "../components/city/BlockColliderVisualizer";
import { DebugColliders } from "../components/debugger/DebugColliders";
import { BlockGLBVisualizer } from "../components/city/BlockGLBVisualizer";
import { BlueTeamBaseGround } from "../components/world/BlueTeamBaseGround";

export function CityScene() {
    // const activeBlock = useSnapshotStore((s) => s.activeBlock);
    const mode = useSnapshotStore((s) => s.mode);
    const debug = useSnapshotStore((s) => s.debug);

    return (
        <group name="city-scene">
        {(mode === "collider" || mode === "hybrid") && debug && (
            <DebugColliders boxes={debug.block_boxes} />
        )}

        {(mode === "glb" || mode === "hybrid") && debug && (
            <BlockGLBVisualizer 
                blockId="block_01"
                boxes={debug.block_boxes} 
          />
        )}

            <BlueTeamBaseGround />
        </group>
    );
}
