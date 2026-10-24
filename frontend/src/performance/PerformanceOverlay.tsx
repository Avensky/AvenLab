import { useRenderSettingsStore } from "../store/renderSettingsStore";
import { useDebugViewStore } from "../store/debugViewStore";
import { useUIStore } from "../store/uiStore";
import { useWorldStore } from "../store/worldStore";
import { useNetworkStore } from "../store/networkStore";
import { getInputSenderStats } from "../net/rustSocket";
import { DEFAULT_INTERPOLATION_DELAY_MS } from "../hooks/usePhysicsInterpolator";
import { usePerformanceReadout } from "./usePerformanceReadout";
import { difference } from "./measurements";

const format = (value: number | null | undefined, digits = 1) => value === undefined || value === null ? "—" : value.toFixed(digits);
export function PerformanceOverlay() {
  const enabled = useRenderSettingsStore((s) => s.overlay);
  // No refresh timer or DOM when the profiler is off.
  return enabled ? <Readout /> : null;
}
function Readout() {
  const stats = usePerformanceReadout();
  const interpolation = useDebugViewStore((s) => s.interpolationEnabled);
  const overlay = useUIStore((s) => s.overlay);
  const hasMapShapes = useWorldStore((s) => s.map?.collider_chunks !== undefined);
  const connected = useNetworkStore((s) => s.connected);
  const { queuedBytes, pendingInputs } = getInputSenderStats();
  const m = stats.metrics;
  const baseline = stats.runs.find((r) => r.id === stats.baselineId);
  const last = stats.runs.at(-1);
  const delta = difference(last?.metrics.frameMs?.mean, baseline?.metrics.frameMs?.mean);
  return <aside className="pointer-events-none fixed left-3 top-3 z-40 max-w-[calc(100vw-24px)] rounded-xl border border-cyan-500/40 bg-slate-950/95 px-4 py-3 font-mono text-xs text-slate-200 shadow-xl" aria-label="Performance overlay">
    <div className="mb-2 flex justify-between gap-6 text-cyan-300"><strong>LATENCY LAB</strong><span>5 s window</span></div>
    <div className="grid grid-cols-[1fr_auto] gap-x-5 gap-y-1">
      <span>FPS / frame mean</span><span>{format(m.frameMs ? 1000 / m.frameMs.mean : null, 0)} / {format(m.frameMs?.mean)} ms</span>
      <span>Frame p95 / p99</span><span>{format(m.frameMs?.p95)} / {format(m.frameMs?.p99)} ms</span>
      <span>CPU submit mean / p95</span><span>{format(m.cpuSubmitMs?.mean)} / {format(m.cpuSubmitMs?.p95)} ms</span>
      <span>Draw calls / triangles</span><span>{format(m.drawCalls?.mean, 0)} / {format(m.triangles?.mean, 0)}</span>
      <span>Geometries / textures</span><span>{format(m.geometries?.mean, 0)} / {format(m.textures?.mean, 0)}</span>
      <span>Input → completed tick → receipt</span><span>{format(m.inputAckMs?.mean)} ms</span>
      <span>RTT / snapshot age</span><span>{format(m.rttMs?.mean)} / {format(m.receiptAgeMs?.mean)} ms</span>
      <span>Snapshot interval mean / p95</span><span>{format(m.arrivalMs?.mean)} / {format(m.arrivalMs?.p95)} ms</span>
      <span>JSON decode mean / p95</span><span>{format(m.decodeMs?.mean, 2)} / {format(m.decodeMs?.p95, 2)} ms</span>
      <span>Snapshots / debug traffic</span><span>{format(stats.snapshotKiBps)} / {format(stats.debugKiBps)} KiB/s</span>
      <span>Server physics / work p95</span><span>{format(m.serverPhysicsMs?.p95, 2)} / {format(m.serverWorkMs?.p95, 2)} ms</span>
      <span>Server lock p95 / input queue</span><span>{format(m.serverLockMs?.p95, 2)} ms / {queuedBytes} B · {pendingInputs} pending</span>
      <span>Interpolation target</span><span>{interpolation ? DEFAULT_INTERPOLATION_DELAY_MS : 0} ms</span>
      <span>Body roll mean / p95</span><span>{format(m.bodyRollDeg?.mean)} / {format(m.bodyRollDeg?.p95)}°</span>
      <span>Airborne tires mean / p95</span><span>{format(m.airborneWheels?.mean)} / {format(m.airborneWheels?.p95, 0)}</span>
    </div>
    <p className="mt-2 border-t border-slate-700 pt-2 text-amber-200">{stats.status}</p>
    {delta !== null && last && baseline && <p>Last capture Δ baseline: {delta >= 0 ? "+" : ""}{format(delta)} ms/frame</p>}
    {overlay && <p className="mt-1 text-amber-300">Menu open · live values include menu rendering</p>}
    {!connected && <p className="mt-1 text-rose-300">Disconnected · waiting for fresh samples</p>}
    {!hasMapShapes && <p className="mt-1 text-rose-300">Collider metadata missing · restart updated Rust server</p>}
    <p className="mt-1 text-[10px] text-slate-400">CPU submit excludes GPU completion. Ack excludes display and interpolation.</p>
  </aside>;
}
