import { useEffect } from "react";
import { addEffect, addAfterEffect, useThree } from "@react-three/fiber";
import { useRenderSettingsStore } from "../store/presentation/renderSettingsStore";
import { useNetworkStore } from "../store/session/networkStore";
import { getInputSenderStats } from "../net/rustSocket";
import { useUIStore } from "../store/menus/uiStore";
import { experimentContext } from "./context";
import { performanceRecorder as recorder } from "./measurements";
import { initializeCaptureArchive } from "./captureActions";
import { cityStreamingStats } from "../world/cityWorkQueue";
import { usePreferencesStore } from "../store/preferences/preferencesStore";
import { useHudPanelsStore } from "../store/hud/hudPanelsStore";
import { sampleHudFrame, resetHudFrames } from "./frameReadout";

export function PerformanceProbe() {
  const gl = useThree((s) => s.gl);
  const overlay = useRenderSettingsStore((s) => s.overlay);
  useEffect(() => {
    recorder.enabled = overlay;
    return () => {
      recorder.enabled = false;
    };
  }, [overlay]);
  useEffect(() => {
    initializeCaptureArchive();
    let previous: number | null = null;
    let started = 0;
    const before = addEffect(() => {
      started = performance.now();
      const preferences = usePreferencesStore.getState();
      const driving =
        document.visibilityState === "visible" &&
        useUIStore.getState().screen === "sandbox";
      if (
        driving &&
        useUIStore.getState().overlay === null &&
        useRenderSettingsStore.getState().hud &&
        preferences.showDriveControls &&
        preferences.hudGroups.climate &&
        preferences.climateHudSize === "compact" &&
        useHudPanelsStore.getState().climate
      )
        sampleHudFrame(started);
      else resetHudFrames();
      if (
        (!recorder.enabled && !recorder.capturing) ||
        document.visibilityState !== "visible" ||
        useUIStore.getState().screen !== "sandbox"
      ) {
        previous = null;
        return;
      }
      if (previous !== null)
        recorder.record("frameMs", started - previous, started);
      previous = started;
    });
    const after = addAfterEffect(() => {
      if (previous === null) return;
      const now = performance.now();
      recorder.record("cpuSubmitMs", now - started, now);
      recorder.record("drawCalls", gl.info.render.calls, now);
      recorder.record("triangles", gl.info.render.triangles, now);
      recorder.record("geometries", gl.info.memory.geometries, now);
      recorder.record("textures", gl.info.memory.textures, now);
      const city = cityStreamingStats();
      recorder.record("cityDetailedChunks", city.detailed, now);
      recorder.record("cityProxyChunks", city.proxies, now);
      recorder.record("cityPendingAssets", city.pending, now);
      const receipt = useNetworkStore.getState().snapshot?.received_at_ms;
      if (receipt !== undefined)
        recorder.record("receiptAgeMs", now - receipt, now);
      recorder.record("queuedBytes", getInputSenderStats().queuedBytes, now);
    });
    const timer = window.setInterval(() => {
      if (recorder.capturing) recorder.tick(experimentContext());
    }, 100);
    const hidden = () => {
      previous = null;
      resetHudFrames();
      if (document.visibilityState !== "visible" && recorder.capturing)
        recorder.cancel("Discarded: tab hidden");
    };
    document.addEventListener("visibilitychange", hidden);
    const observer =
      typeof PerformanceObserver !== "undefined" &&
      PerformanceObserver.supportedEntryTypes?.includes("longtask")
        ? new PerformanceObserver((list) => {
            for (const entry of list.getEntries())
              recorder.record(
                "longTaskMs",
                entry.duration,
                entry.startTime + entry.duration,
              );
          })
        : null;
    observer?.observe({ type: "longtask", buffered: true });
    return () => {
      before();
      after();
      resetHudFrames();
      observer?.disconnect();
      clearInterval(timer);
      document.removeEventListener("visibilitychange", hidden);
      recorder.cancel("Canvas stopped");
    };
  }, [gl]);
  return null;
}
