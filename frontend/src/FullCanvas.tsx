import { Canvas } from "@react-three/fiber";
import { type ReactNode } from "react";
import { useRenderSettingsStore } from "./store/renderSettingsStore";
import { PerformanceProbe } from "./performance/PerformanceProbe";

export function FullCanvas({ children }: { children: ReactNode }) {
    const dpr = useRenderSettingsStore((s) => s.dpr);
    const shadows = useRenderSettingsStore((s) => s.shadows);
    return (
        <div
            style={{
                position: "fixed",
                inset: 0,
                width: "100vw",
                height: "100svh",  // mobile-safe viewport height
                overflow: "hidden",
                touchAction: "none",
                // background: "black",
                zIndex: 0,
            }}
        >
            <Canvas
                camera={{ position: [0, 10, 20], fov: 50 }}
                dpr={dpr}
                shadows={shadows}
                gl={{
                    antialias: false,
                    powerPreference: "high-performance",
                    failIfMajorPerformanceCaveat: false,
                }}
            >
                {/* <color attach="background" args={["#050509"]} /> */}

                {/* Ground */}
                {/* <mesh rotation={[-Math.PI / 2, 0, 0]}>
                    <planeGeometry args={[200, 200, 1, 1]} />
                    <meshStandardMaterial color="#222" />
                </mesh> */}

                <PerformanceProbe />
                {children}
            </Canvas>
        </div>
    );
}
