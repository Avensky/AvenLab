import { OrbitControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { type ReactNode } from "react";

export function FullscreenCanvas({ children }: { children: ReactNode }) {
    return (
        <div
            style={{
                position: "fixed",
                inset: 0,
                width: "100vw",
                height: "100svh",  // mobile-safe viewport height
                overflow: "hidden",
                touchAction: "none",
                background: "black",
                zIndex: 0,
            }}
        >
            <Canvas
                camera={{ position: [0, 10, 20], fov: 50 }}
                dpr={[0.75, 1]} // improve clarity on retina
                gl={{
                    antialias: false,
                    powerPreference: "high-performance",
                    failIfMajorPerformanceCaveat: false,
                }}
            >
                {/* <color attach="background" args={["#050509"]} /> */}

                {/* Lighting */}
                <ambientLight intensity={0.5} />
                {/* <directionalLight intensity={1} position={[5, 5, 5]} /> */}
                <directionalLight intensity={1.2} position={[10, 20, 10]} />

                {/* Camera Controls */}
                <OrbitControls />

                {/* Ground */}
                {/* <mesh rotation={[-Math.PI / 2, 0, 0]}>
                    <planeGeometry args={[200, 200, 1, 1]} />
                    <meshStandardMaterial color="#222" />
                </mesh> */}

                {children}
            </Canvas>
        </div>
    );
}
