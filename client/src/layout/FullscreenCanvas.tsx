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
                camera={{ position: [6, 6, 6], fov: 50 }}
                dpr={[1, 2]}  // improve clarity on retina
            >
                {children}
            </Canvas>
        </div>
    );
}
