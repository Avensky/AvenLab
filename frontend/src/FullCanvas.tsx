import { useUIStore } from "./store/menus";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef, useSyncExternalStore, type ReactNode } from "react";
import { useRenderSettingsStore } from "./store/presentation/renderSettingsStore";
import { PerformanceProbe } from "./performance/PerformanceProbe";

import { ScoreboardSceneCover } from "./game/stats/ScoreboardSceneCover";
import { usePreferencesStore } from "./store/preferences/preferencesStore";
import { isCompactPreview, PREVIEW_FRAME_MS } from "./game/preview/previewBudget";

const compactViewport = () => isCompactPreview(window.innerWidth);
function subscribeViewport(listener: () => void) {
  window.addEventListener("resize", listener);
  return () => window.removeEventListener("resize", listener);
}

function PreviewFrameClock() {
  const invalidate = useThree(s => s.invalidate);
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (!document.hidden) invalidate();
    }, PREVIEW_FRAME_MS);
    return () => window.clearInterval(timer);
  }, [invalidate]);
  return null;
}

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
  const reducedMotion = usePreferencesStore(s => s.reducedMotion);
  const compact = useSyncExternalStore(subscribeViewport, compactViewport, () => false) && preview;
  const demand = authoring || paused || (preview && (compact || reducedMotion));
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
        frameloop={demand ? "demand" : "always"}
        camera={{ position: [0, 10, 20], fov: 50, far: 2000 }}
        dpr={compact ? Math.min(dpr, 1) : dpr}
        shadows={shadows && !compact}
        gl={{
          antialias: false,
          alpha: true,
          powerPreference: "high-performance",
          failIfMajorPerformanceCaveat: false,
        }}
      >
        {preview && <RevealPreview />}
        {compact && !paused && !authoring && !reducedMotion && <PreviewFrameClock />}
        <ScoreboardSceneCover />
        <PerformanceProbe />
        {children}
      </Canvas>
    </div>
  );
}
