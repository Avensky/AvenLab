import { useSnapshotStore } from "../store/store";

export function ModeSwitcher() {
    const mode = useSnapshotStore((s) => s.mode);
    const setMode = useSnapshotStore((s) => s.setMode);

    return (
        <div style={{
            position: "absolute",
            top: "1rem",
            left: "1rem",
            zIndex: 20,
            display: "flex",
            gap: "1rem"
        }}>
            <button onClick={() => setMode("glb")} disabled={mode === "glb"}>
                Glb
            </button>
            <button onClick={() => setMode("hybrid")} disabled={mode === "hybrid"}>
                Hybrid
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
