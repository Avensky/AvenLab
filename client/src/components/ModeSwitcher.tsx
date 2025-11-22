import { useSnapshotStore } from "../store/snapshotStore";

export function ModeSwitcher() {
    const mode = useSnapshotStore((s) => s.mode);
    const setMode = useSnapshotStore((s) => s.setMode);

    return (
        <div style={{ position: "absolute", top: 20, left: 20, zIndex: 10 }}>
            <button onClick={() => setMode("glb")} disabled={mode === "glb"}>
                GLB
            </button>
            <button onClick={() => setMode("geometry")} disabled={mode === "geometry"}>
                Geometry
            </button>
            <button onClick={() => setMode("collider")} disabled={mode === "collider"}>
                Collider
            </button>
        </div>
    );
}
