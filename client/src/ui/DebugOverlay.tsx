import { useSnapshotStore } from "../store/store";
import { useFrame } from "@react-three/fiber";
import { useState } from "react";

export function DebugOverlay() {
    const connected = useSnapshotStore((s) => s.connected);
    const snapshot = useSnapshotStore((s) => s.snapshot);
    const me = useSnapshotStore((s) => s.getMe());

    // const [fps, setFps] = useState(0);

    // useFrame((_, delta) => {
    //     setFps(Math.round(1 / delta));
    // });

    return (
        <div style={{
            position: "absolute",
            top: 10,
            right: 10,
            padding: "12px 16px",
            background: "rgba(0,0,0,0.55)",
            color: "white",
            fontFamily: "monospace",
            fontSize: "14px",
            lineHeight: "18px",
            borderRadius: "8px",
            pointerEvents: "none",
            whiteSpace: "pre",
            zIndex: 9999,
            width: "25%",
        }}>
            <b>AvenLab Debug HUD</b>
            {"\n"}Connected: {String(connected)}
            {/* {"\n"}FPS: {fps} */}
            {"\n"}Tick: {snapshot?.tick ?? "null"}

            {me ? (
                <>
                    {"\n"}PlayerID: {me.id}
                    {"\n"}Position:
                    {"\n"}  x={me.x.toFixed(2)}
                    {"\n"}  y={me.y.toFixed(2)}
                    {"\n"}  z={me.z.toFixed(2)}
                </>
            ) : (
                "\nPlayer: null"
            )}
        </div>
    );
}
