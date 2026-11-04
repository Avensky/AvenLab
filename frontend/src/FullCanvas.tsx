import { useUIStore } from "./store/menus";
import { Canvas, useFrame } from "@react-three/fiber";
import { useRef, type ReactNode } from "react";
import { useRenderSettingsStore } from "./store/presentation/renderSettingsStore";
import { PerformanceProbe } from "./performance/PerformanceProbe";

import { ScoreboardSceneCover } from "./game/stats/ScoreboardSceneCover";

function RevealPreview() {
  const shown = useRef(false);
  useFrame(({ gl }) => {
    if (shown.current) return;
    shown.current = true;
    // Reveal after this frame's renderer/composer completes, on its existing loop.
    queueMicrotask(() => {
      gl.domElement.dataset.previewReady = "true";
    });
  }, -100);
  return null;
}

export function FullCanvas({
  children,
  preview = false,
  paused = false,
}: {
  children: ReactNode;
  preview?: boolean;
  paused?: boolean;
}) {
  const authoring = useUIStore(
    (s) => s.screen === "world_builder" || s.overlay === "world_builder",
  );
  const dpr = useRenderSettingsStore((s) => s.dpr);
  const shadows = useRenderSettingsStore((s) => s.shadows);
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        width: "100vw",
        height: "100svh", // mobile-safe viewport height
        overflow: "hidden",
        touchAction: "none",
        // background: "black",
        zIndex: 0,
      }}
    >
      <Canvas
        className={preview ? "garage-canvas" : undefined}
        frameloop={authoring || paused ? "demand" : "always"}
        camera={{ position: [0, 10, 20], fov: 50, far: 2000 }}
        dpr={dpr}
        shadows={shadows}
        gl={{
          antialias: false,
          alpha: true,
          powerPreference: "high-performance",
          failIfMajorPerformanceCaveat: false,
        }}
      >
        {preview && <RevealPreview />}
        {/* <color attach="background" args={["#050509"]} /> */}

        {/* Ground */}
        {/* <mesh rotation={[-Math.PI / 2, 0, 0]}>
                    <planeGeometry args={[200, 200, 1, 1]} />
                    <meshStandardMaterial color="#222" />
                </mesh> */}

        <ScoreboardSceneCover />
        <PerformanceProbe />
        {children}
      </Canvas>
    </div>
  );
}
