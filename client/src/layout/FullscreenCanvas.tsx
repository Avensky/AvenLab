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
                dpr={[1, 2]}  // improve clarity on retina
            >
                <color attach="background" args={["#050509"]} />
                <ambientLight intensity={0.5} />
                <directionalLight position={[10, 20, 10]} intensity={1.2} />
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
