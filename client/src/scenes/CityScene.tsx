// import { useGLTF } from "@react-three/drei";
import { useEffect} from "react";
import { useSnapshotStore, type BlockColliderFile } from "../store/store";
import { BlockColliderVisualizer } from "../components/city/BlockColliderVisualizer";
// import { BlockGLBVisualizer } from "../components/city/BlockGLBVisualizer";

export function CityScene() {
    // const block = useSnapshotStore((s) => s.activeBlock);
    const mode = useSnapshotStore((s) => s.mode);
    const activeBlock = useSnapshotStore((s) => s.activeBlock);
    
    const setActiveBlock = useSnapshotStore((s) => s.setActiveBlock);

    useEffect(() => {
        let cancelled = false;

        async function loadBlock() {
        try {
            const res = await fetch("/data/blocks/block_01_colliders.json");
            if (!res.ok) {
            throw new Error(`Failed to load block JSON: ${res.status}`);
            }

            const block = (await res.json()) as BlockColliderFile;
            if (!cancelled) {
            setActiveBlock(block);
            }
        } catch (err) {
            console.error("Failed to load active block:", err);
        }
        }

        if (!activeBlock) {
        loadBlock();
        }

        return () => {
        cancelled = true;
        };
    }, [activeBlock, setActiveBlock]);

    if (!activeBlock) return null;

    return (
        <group name="city-scene">
        {(mode === "collider" || mode === "hybrid") && (
            <BlockColliderVisualizer block={activeBlock} />
        )}

        {/* {(mode === "glb" || mode === "hybrid") && (
            <BlockGLBVisualizer block={activeBlock} />
        )} */}
        </group>
    );
}
