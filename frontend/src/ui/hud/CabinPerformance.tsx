import { memo } from "react";
import { useFrameReadout } from "../../performance/frameReadout";
import { useNetworkStore } from "../../store/session/networkStore";

/** Isolate the low-rate readout so frame/ping updates never rerender the knobs. */
export const CabinPerformance = memo(function CabinPerformance() {
  const fps = useFrameReadout((s) => s.fps);
  const frameMs = useFrameReadout((s) => s.frameMs);
  const ping = useNetworkStore((s) =>
    s.connected && s.pingMs !== null && Number.isFinite(s.pingMs)
      ? Math.round(s.pingMs)
      : null,
  );
  return (
    <div className="cabin-performance" aria-label="Live performance">
      <output aria-label="Frames per second">
        {fps ?? "—"}
        <small>FPS</small>
      </output>
      <output aria-label="Frame time" title="Average rendered frame time">
        {frameMs?.toFixed(1) ?? "—"}
        <small>MS / FRAME</small>
      </output>
      <output
        aria-label="Network round trip"
        title="Round-trip latency on the existing game connection"
      >
        {ping ?? "—"}
        <small>MS PING</small>
      </output>
    </div>
  );
});
