import { useState } from "react";
import { inputRef } from "../store/inputStore";
import { useRenderSettingsStore } from "../store/renderSettingsStore";
import { useDebugViewStore } from "../store/debugViewStore";
import { useUIStore } from "../store/uiStore";
import { useWorldStore } from "../store/worldStore";
import { useNetworkStore } from "../store/networkStore";
import { getInputSenderStats } from "../net/rustSocket";
import { DEFAULT_INTERPOLATION_DELAY_MS } from "../hooks/usePhysicsInterpolator";
import { usePerformanceReadout } from "./usePerformanceReadout";
import { difference } from "./measurements";
import { useCaptureSettingsStore } from "./captureSettingsStore";
import { exportPerformanceCaptures, startPerformanceCapture, togglePerformanceCapture } from "./captureActions";
import { spawnJson } from "./location";
import { cityStreamingStats } from "../world/cityWorkQueue";
import { CITY_QUALITY_LABELS } from "../world/cityLod";

const format = (value: number | null | undefined, digits = 1) => value === undefined || value === null ? "—" : value.toFixed(digits);
export function PerformanceOverlay() {
  const enabled = useRenderSettingsStore((s) => s.overlay);
  // No refresh timer or DOM when the profiler is off.
  return enabled ? <Readout /> : null;
}
function Readout() {
  const stats = usePerformanceReadout();
  const capture = useCaptureSettingsStore();
  const opaqueCityMaterials = useRenderSettingsStore((s) => s.opaqueCityMaterials);
  const cityQuality = useRenderSettingsStore((s) => s.cityQuality);
  const city = cityStreamingStats();
  const [copyStatus, setCopyStatus] = useState("");
  const interpolation = useDebugViewStore((s) => s.interpolationEnabled);
  const overlay = useUIStore((s) => s.overlay);
  const hasMapShapes = useWorldStore((s) => s.map?.collider_chunks !== undefined);
  const connected = useNetworkStore((s) => s.connected);
  const sender = getInputSenderStats();
  const { queuedBytes, pendingInputs } = sender;
  const network = useNetworkStore.getState();
  const input = inputRef.current;
  const m = stats.metrics;
  const baseline = stats.runs.find((r) => r.id === stats.baselineId);
  const last = stats.runs.at(-1);
  const delta = difference(last?.metrics.frameMs?.mean, baseline?.metrics.frameMs?.mean);
  const location = stats.location;
  const spawn = location ? spawnJson(location) : null;
  const countdown = stats.progress.phase === "recording" ? `RECORDING · ${(stats.progress.remainingMs / 1000).toFixed(1)} s LEFT`
    : stats.progress.phase === "warmup" ? `STARTS IN ${(stats.progress.remainingMs / 1000).toFixed(1)} s`
      : stats.progress.phase === "waiting" ? "WAITING TO RECORD" : stats.status;
  const copySpawn = async () => {
    if (!spawn) return;
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(spawn); setCopyStatus("Spawn copied · yaw in radians");
    } catch { setCopyStatus("Clipboard unavailable · use the coordinates below"); }
  };
  return <aside className="pointer-events-auto fixed left-3 top-3 z-40 max-h-[calc(100svh-24px)] w-[min(26rem,calc(100vw-24px))] overflow-y-auto rounded-sm border border-cyan-500/40 bg-slate-950/95 px-3 py-3 font-mono text-[10px] text-slate-200 sm:text-xs shadow-xl"
    onPointerDown={(event) => event.stopPropagation()} onWheel={(event) => event.stopPropagation()} aria-label="Performance overlay">
    <div className="mb-2 flex items-center justify-between gap-3 text-cyan-300"><strong>LATENCY LAB</strong><span>5 s window</span>
      <button type="button" className="menu-control" aria-label="Close performance overlay" title="Close performance overlay (F3)"
        onClick={() => useRenderSettingsStore.getState().update({ overlay: false })}>F3 · ×</button>
    </div>
    <div className="mb-3 space-y-2 border-b border-slate-700 pb-3">
      <label className="flex items-center gap-2">LABEL
        <input aria-label="Capture label" value={capture.label} disabled={stats.capturing} maxLength={120} placeholder="e.g. city-original"
          onChange={(event) => capture.update({ label: event.target.value })}
          className="min-w-0 flex-1 rounded-none border border-slate-600 bg-slate-900 px-2 py-2 text-base sm:text-xs disabled:opacity-60" />
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1">LENGTH
          <select aria-label="Capture length" value={capture.seconds} disabled={stats.capturing} onChange={(event) => capture.update({ seconds: Number(event.target.value) })}
            className="border border-slate-600 bg-slate-900 px-1 py-2 text-base sm:text-xs">{[5, 10, 20].map((seconds) => <option key={seconds} value={seconds}>{seconds}s</option>)}</select>
        </label>
        <label className="flex items-center gap-1"><input type="checkbox" checked={capture.asBaseline} disabled={stats.capturing}
          onChange={(event) => capture.update({ asBaseline: event.target.checked })} />SET BASELINE</label>
        <button type="button" onClick={() => stats.capturing ? togglePerformanceCapture() : startPerformanceCapture(undefined, true)}
          className="ml-auto border border-red-500 bg-red-950 px-3 py-2 font-bold text-red-200 hover:bg-red-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-yellow-300">{stats.capturing ? "CANCEL" : "RECORD"}</button>
      </div>
      <p className="text-slate-400">F8 · A / Cross with overlay visible · 3s warm-up</p>
      <p role={stats.capturing ? "timer" : "status"} aria-label="Capture countdown" className={stats.capturing ? "font-bold text-red-400" : "text-cyan-300"}>{countdown}</p>
      {stats.progress.phase === "waiting" && <p className="text-amber-200">{stats.status}</p>}
      {stats.capturing && <p className="break-words text-red-300">{stats.progress.label}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={!stats.runs.length} onClick={() => exportPerformanceCaptures("json")} className="border border-cyan-700 px-2 py-2 hover:bg-cyan-950 disabled:opacity-40">EXPORT JSON</button>
        <button type="button" disabled={!stats.runs.length} onClick={() => exportPerformanceCaptures("csv")} className="border border-cyan-700 px-2 py-2 hover:bg-cyan-950 disabled:opacity-40">EXPORT CSV</button>
        <span className="self-center">{stats.runs.length} CAPTURES</span>
      </div>
      <p className="text-slate-400">{stats.storageStatus}</p>
      {last && <p className="break-words">LAST: {last.label} {last.baseline ? "· BASELINE" : ""}</p>}
    </div>
    <div className="mb-3 border-b border-slate-700 pb-3">
      <div className="flex items-center justify-between gap-2"><strong className="text-cyan-300">PLAYER POSITION · METERS</strong>
        <button type="button" disabled={!spawn} onClick={copySpawn} className="border border-slate-600 px-2 py-2 hover:bg-slate-800 disabled:opacity-40">COPY SPAWN</button></div>
      <p className="mt-1">X {format(location?.position[0], 3)} · Y {format(location?.position[1], 3)} · Z {format(location?.position[2], 3)}</p>
      <p>CHUNK {location?.chunk?.join(", ") ?? "—"} · LOCAL X {format(location?.local?.[0], 3)} / Z {format(location?.local?.[2], 3)}</p>
      <p>YAW {format(location?.yaw, 3)} rad / {format(location ? location.yaw * 180 / Math.PI : null)}°</p>
      {copyStatus && <p role="status" className="text-cyan-300">{copyStatus}</p>}
    </div>
    <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-5 gap-y-1">
      <span>FPS / frame mean</span><span>{format(m.frameMs ? 1000 / m.frameMs.mean : null, 0)} / {format(m.frameMs?.mean)} ms</span>
      <span>Frame p95 / p99</span><span>{format(m.frameMs?.p95)} / {format(m.frameMs?.p99)} ms</span>
      <span>CPU submit mean / p95</span><span>{format(m.cpuSubmitMs?.mean)} / {format(m.cpuSubmitMs?.p95)} ms</span>
      <span>Draw calls / triangles</span><span>{format(m.drawCalls?.mean, 0)} / {format(m.triangles?.mean, 0)}</span>
      <span>Geometries / textures</span><span>{format(m.geometries?.mean, 0)} / {format(m.textures?.mean, 0)}</span>
      <span>City models / silhouette chunks</span><span>{CITY_QUALITY_LABELS[cityQuality]} · {city.detailed} / {city.proxies}</span>
      <span>City preparations / long task p95</span><span>{city.pending} / {format(m.longTaskMs?.p95)} ms</span>
    </div>
    {city.pending > 0 && <p role="status" className="mt-1 text-amber-200">{city.phase}</p>}
    <details className="mt-2"><summary className="py-2 text-cyan-300">NETWORK / PHYSICS DETAILS</summary>
    <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1">
      <span>Input → completed tick → receipt</span><span>{format(m.inputAckMs?.mean)} ms</span>
      <span>RTT / snapshot age</span><span>{format(m.rttMs?.mean)} / {format(m.receiptAgeMs?.mean)} ms</span>
      <span>Snapshot interval mean / p95</span><span>{format(m.arrivalMs?.mean)} / {format(m.arrivalMs?.p95)} ms</span>
      <span>JSON decode mean / p95</span><span>{format(m.decodeMs?.mean, 2)} / {format(m.decodeMs?.p95, 2)} ms</span>
      <span>Snapshots / debug traffic</span><span>{format(stats.snapshotKiBps)} / {format(stats.debugKiBps)} KiB/s</span>
      <span>Server physics / work p95</span><span>{format(m.serverPhysicsMs?.p95, 2)} / {format(m.serverWorkMs?.p95, 2)} ms</span>
      <span>Server lock p95 / input queue</span><span>{format(m.serverLockMs?.p95, 2)} ms / {queuedBytes} B · {pendingInputs} pending</span>
      <span>Tick / debug tick</span><span>{network.tick ?? "—"} / {network.debugTick ?? "—"}</span>
      <span>Input sender / sent / skipped</span><span>{sender.running ? "on" : "off"} / {sender.sent} / {sender.skipped}</span>
      <span>Oldest pending input</span><span>{format(sender.oldestPendingMs)} ms</span>
      <span>Payload snapshot / debug</span><span>{sender.snapshotChars} / {sender.debugChars} chars</span>
      <span>Peak decode / ack seq</span><span>{format(sender.worstDecodeMs, 2)} ms / {sender.acknowledgedInputSeq ?? "—"}</span>
      <span>Backend vehicle speed</span><span>{format(network.physicsData?.speed, 2)} m/s</span>
      <span>Throttle / brake / handbrake</span><span>{format(input.throttle, 2)} / {format(input.brake, 2)} / {format(input.handbrake, 2)}</span>
      <span>Interpolation target</span><span>{interpolation ? DEFAULT_INTERPOLATION_DELAY_MS : 0} ms</span>
      <span>Body roll mean / p95</span><span>{format(m.bodyRollDeg?.mean)} / {format(m.bodyRollDeg?.p95)}°</span>
      <span>Airborne tires mean / p95</span><span>{format(m.airborneWheels?.mean)} / {format(m.airborneWheels?.p95, 0)}</span>
    </div></details>
    <label className="mt-2 flex items-center gap-2 border-t border-slate-700 pt-2"><input type="checkbox" checked={cityQuality !== "original" || opaqueCityMaterials} disabled={stats.capturing || cityQuality !== "original"}
      onChange={(event) => useRenderSettingsStore.getState().update({ opaqueCityMaterials: event.target.checked })} />OPAQUE CITY MATERIALS · {cityQuality === "original" ? "A/B TEST" : "CITY DETAIL PRESET"}</label>
    <details className="mt-1"><summary className="py-2 text-cyan-300">ACTIVE CITY ASSETS</summary>
      {useWorldStore.getState().map?.visuals.map((visual) => <p key={visual.id} className="break-all">{visual.id}: {visual.asset}</p>)}
    </details>
    {delta !== null && last && baseline && <p>Last capture Δ baseline: {delta >= 0 ? "+" : ""}{format(delta)} ms/frame</p>}
    {overlay && <p className="mt-1 text-amber-300">Menu open · live values include menu rendering</p>}
    {!connected && <p className="mt-1 text-rose-300">Disconnected · waiting for fresh samples</p>}
    {!hasMapShapes && <p className="mt-1 text-rose-300">Collider metadata missing · restart updated Rust server</p>}
    <p className="mt-1 text-[10px] text-slate-400">CPU submit excludes GPU completion. Ack excludes display and interpolation.</p>
  </aside>;
}
