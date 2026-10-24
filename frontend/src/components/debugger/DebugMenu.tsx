import { useEffect, useMemo, useState } from "react";
import { GameButton } from "../GameButton";
import { useUIStore } from "../../store/uiStore";
import { useWorldStore } from "../../store/worldStore";
import { useNetworkStore } from "../../store/networkStore";
import { inputRef } from "../../store/inputStore";
import { getInputSenderStats } from "../../net/rustSocket";
import { DEFAULT_INTERPOLATION_DELAY_MS } from "../../hooks/usePhysicsInterpolator";
import { useDebugViewStore } from "../../store/debugViewStore";
import { DebugFlags, hasDebugFlag } from "../../store/tools/debugMasks";
import { assetKey, chunkKey, useRenderSettingsStore, type VisualMode } from "../../store/renderSettingsStore";
import { experimentContext } from "../../performance/context";
import { capturesCsv, difference, performanceRecorder as recorder } from "../../performance/measurements";
import { useVisualAlignmentStore } from "../../store/visualAlignmentStore";
import { usePerformanceReadout } from "../../performance/usePerformanceReadout";

const MODES: VisualMode[] = ["collider", "geometry", "glb", "hybrid", "hidden"];
const DEBUG_OPTIONS = [
  ["Chassis", DebugFlags.CHASSIS], ["Wheels", DebugFlags.WHEELS],
  ["Suspension Rays", DebugFlags.RAYS], ["Slip Vectors", DebugFlags.SLIP],
  ["Load Bars", DebugFlags.LOAD_BARS], ["Anti-Roll Bars", DebugFlags.ARB],
  ["Block Colliders", DebugFlags.BLOCKS],
] as const;
const ALL_DEBUG = DEBUG_OPTIONS.reduce((mask, [, flag]) => mask | flag, 0);
const step = <T,>(values: readonly T[], value: T, direction = 1): T => values[(values.indexOf(value) + direction + values.length) % values.length];
function download(contents: string, extension: "json" | "csv") {
  const url = URL.createObjectURL(new Blob([contents], { type: extension === "csv" ? "text/csv;charset=utf-8" : "application/json" }));
  const link = document.createElement("a");
  link.href = url; link.download = `avenlab-performance-${Date.now()}.${extension}`;
  document.body.append(link); link.click(); link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function readDiagnostics() {
  const state = useNetworkStore.getState();
  return {
    tick: state.tick, debugTick: state.debugTick, connected: state.connected,
    interval: state.snapshotIntervalMs, ping: state.pingMs,
    age: state.snapshot?.received_at_ms === undefined ? null : performance.now() - state.snapshot.received_at_ms,
    speed: state.snapshot?.entities.find((entity) => entity.id === state.playerId)?.speed ?? null,
    throttle: inputRef.current.throttle, brake: inputRef.current.brake, handbrake: inputRef.current.handbrake,
    ...getInputSenderStats(),
  };
}

function NetworkDiagnostics() {
  const [stats, setStats] = useState(readDiagnostics);
  useEffect(() => {
    // Slow refresh keeps the menu out of the packet/render hot path.
    const timer = window.setInterval(() => setStats(readDiagnostics()), 250);
    return () => window.clearInterval(timer);
  }, []);
  const ms = (value: number | null) => value === null ? "—" : `${Math.round(value)} ms`;
  return (
    <p className="mt-1" aria-live="off">
      {stats.connected ? "connected" : "disconnected"} · tick: {stats.tick ?? "—"} · debug tick: {stats.debugTick ?? "—"}
      <br />receipt age: {ms(stats.age)} · arrival interval: {ms(stats.interval)} · RTT: {ms(stats.ping)}
      <br />input loop: {stats.running ? "on" : "off"} · sent: {stats.sent} · skipped while queued: {stats.skipped} · queued: {stats.queuedBytes} B
      <br />backend speed: {stats.speed === null ? "—" : `${stats.speed.toFixed(2)} m/s`} · requested throttle: {stats.throttle.toFixed(2)} · brake: {stats.brake.toFixed(2)} · handbrake: {stats.handbrake.toFixed(2)}
      <br />input → completed tick → receipt: {ms(stats.inputAckMs)} · ack seq: {stats.acknowledgedInputSeq ?? "—"} · pending: {stats.pendingInputs} · oldest pending: {ms(stats.oldestPendingMs)}
      <br />snapshot: {stats.snapshotChars} chars · debug: {stats.debugChars} chars · JSON decode: {stats.decodeMs.toFixed(1)} ms · peak: {stats.worstDecodeMs.toFixed(1)} ms
    </p>
  );
}

export function DebugMenu() {
  const settings = useRenderSettingsStore();
  const mode = useWorldStore((s) => s.mode);
  const mask = useWorldStore((s) => s.debugMask);
  const map = useWorldStore((s) => s.map);
  const debug = useDebugViewStore();
  const rosterKey = useNetworkStore((s) => JSON.stringify((s.snapshot?.entities ?? []).map((e) => [e.id, e.vehicle_id])));
  const [selectedRow, setSelectedRow] = useState(0);
  const [label, setLabel] = useState("");
  const [duration, setDuration] = useState(10);
  const rows = useMemo(() => {
    const world = useWorldStore.getState();
    const capture = (baseline: boolean) => {
      settings.update({ overlay: true });
      recorder.start(label, baseline, duration, experimentContext());
      useUIStore.getState().setOverlay(null);
    };
    const toggles = (["overlay", "shadows", "reflections", "stars", "fog", "vehicleLights", "hud", "autoVehicleAlignment"] as const).map((key) => ({
      label: `${({ overlay: "Lag / data overlay", shadows: "Shadows", reflections: "HDR reflections", stars: "Animated stars", fog: "Fog", vehicleLights: "Vehicle spotlights", hud: "Driving HUD + terminal", autoVehicleAlignment: "Automatic GLB alignment" })[key]}: ${settings[key] ? "ON" : "OFF"}`,
      action: () => settings.update({ [key]: !settings[key] }),
    }));
    return [
      { label: "RESET TO LOWEST-LAG COLLIDER BASELINE", action: () => { recorder.cancel("Baseline reset"); settings.baseline(); } },
      { label: `Vehicles default: ${mode.toUpperCase()}`, action: (dir = 1) => { world.setMode(step(["collider", "geometry", "glb", "hybrid"] as const, mode, dir)); settings.update({ vehicleOverrides: {} }); } },
      { label: `Environment default: ${settings.environmentMode.toUpperCase()}`, action: (dir = 1) => settings.update({ environmentMode: step(MODES, settings.environmentMode, dir), chunkOverrides: {}, assetGlbs: {} }) },
      { label: `Vehicle interpolation: ${debug.interpolationEnabled ? `ON (${DEFAULT_INTERPOLATION_DELAY_MS} ms target)` : "OFF (latest snapshot)"}`, action: () => debug.toggleInterpolation() },
      { label: `Resolution scale: ${settings.dpr}×`, action: (dir = 1) => settings.update({ dpr: step([0.5, 0.75, 1, 1.5, 2], settings.dpr, dir) }) },
      ...toggles,
      { label: `Capture length: ${duration} seconds + 3 second warm-up`, action: (dir = 1) => setDuration(step([5, 10, 20], duration, dir)) },
      { label: "RECORD BASELINE & RESUME", action: () => capture(true) },
      { label: "RECORD COMPARISON & RESUME", action: () => capture(false) },
      { label: "CANCEL CAPTURE", action: () => recorder.cancel() },
      { label: "EXPORT CAPTURES AS CSV", action: () => download(capturesCsv(recorder.runs), "csv") },
      { label: "EXPORT CAPTURES AS JSON", action: () => download(JSON.stringify(recorder.runs, null, 2), "json") },
      { label: "CLEAR CAPTURES", action: () => recorder.clear() },
      ...(JSON.parse(rosterKey) as [string, string | null][]).map(([id, vehicle]) => ({
        label: `Vehicle ${vehicle ?? "unknown"} · ${id.slice(0, 8)}: ${(settings.vehicleOverrides[id] ?? mode).toUpperCase()}`,
        action: (dir = 1) => settings.setVehicleMode(id, step(MODES, settings.vehicleOverrides[id] ?? mode, dir)),
      })),
      ...(map?.chunks ?? []).flatMap((chunk) => {
        const key = chunkKey(chunk.x, chunk.z);
        const chunkMode = settings.chunkOverrides[key] ?? settings.environmentMode;
        return [
          { label: `City chunk ${key}: ${chunkMode.toUpperCase()}`,
            action: (dir = 1) => settings.setChunkMode(key, step(MODES, chunkMode, dir)) },
          ...(map?.visuals ?? []).map((visual) => {
            const asset = assetKey(chunk.x, chunk.z, visual.id);
            const enabled = settings.assetGlbs[asset] ?? (chunkMode === "glb" || chunkMode === "hybrid");
            return { label: `GLB asset ${asset}: ${enabled ? "ON" : "OFF"}`,
              action: () => settings.setAssetGlb(asset, !enabled) };
          }),
        ];
      }),
      { label: `Diagnostic player scope: ${debug.playerScope.toUpperCase()}`, action: () => debug.togglePlayerScope() },
      { label: `All diagnostic streams: ${(mask & ALL_DEBUG) === ALL_DEBUG ? "ON" : "OFF"}`, action: () => world.setDebugMask((mask & ALL_DEBUG) === ALL_DEBUG ? 0 : ALL_DEBUG) },
      ...DEBUG_OPTIONS.map(([name, flag]) => ({ label: `${name} diagnostics: ${hasDebugFlag(mask, flag) ? "ON" : "OFF"}`, action: () => world.toggleDebugFlag(flag) })),
      { label: "RESUME DRIVING", action: () => useUIStore.getState().setOverlay(null) },
      { label: "BACK TO PAUSE MENU", action: () => useUIStore.getState().setOverlay("pause") },
    ];
  }, [settings, mode, mask, map, debug, rosterKey, label, duration]);
  useEffect(() => {
    const handlers = {
      up: () => setSelectedRow((row) => (row - 1 + rows.length) % rows.length),
      down: () => setSelectedRow((row) => (row + 1) % rows.length),
      left: () => rows[selectedRow]?.action(-1), right: () => rows[selectedRow]?.action(1),
      activate: () => rows[selectedRow]?.action(), back: () => useUIStore.getState().setOverlay("pause"),
    };
    const names = { up: "avenlab:debug-menu-up", down: "avenlab:debug-menu-down", left: "avenlab:debug-menu-left",
      right: "avenlab:debug-menu-right", activate: "avenlab:debug-menu-activate", back: "avenlab:debug-menu-back" } as const;
    for (const key of Object.keys(names) as (keyof typeof names)[]) window.addEventListener(names[key], handlers[key]);
    const keyboard = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.target instanceof HTMLInputElement) return;
      const key = ({ ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right", Enter: "activate", " ": "activate", Escape: "back" } as Record<string, keyof typeof handlers>)[event.key];
      if (!key) return;
      event.preventDefault();
      if (!event.repeat || key === "up" || key === "down") handlers[key]();
    };
    window.addEventListener("keydown", keyboard);
    return () => {
      for (const key of Object.keys(names) as (keyof typeof names)[]) window.removeEventListener(names[key], handlers[key]);
      window.removeEventListener("keydown", keyboard);
    };
  }, [rows, selectedRow]);
  useEffect(() => { document.querySelector(`[data-debug-row="${selectedRow}"]`)?.scrollIntoView({ block: "nearest" }); }, [selectedRow]);
  return <div className="game-ui fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-3">
    <section className="flex max-h-[94vh] w-[min(96vw,1040px)] flex-col overflow-hidden rounded-2xl border border-cyan-300/35 bg-slate-950 text-slate-100 shadow-2xl">
      <header className="border-b border-cyan-400/20 px-5 py-4">
        <p className="text-xs uppercase tracking-[0.3em] text-cyan-300">REDLINE VECTOR / PERFORMANCE</p>
        <h2 className="mt-1 text-2xl font-black">Latency Lab & Debugger</h2>
        <p className="mt-1 text-xs text-slate-400">D-pad / arrows navigate · A / Enter changes · Left / right cycles · B returns</p>
        <p className="mt-2 text-sm text-slate-300">Start with colliders, then enable one vehicle, city chunk or effect. Captures resume gameplay, warm up for 3 seconds and save mean / p95 / p99 frame times and network metrics.</p>
        <label className="mt-3 flex items-center gap-3 text-xs text-slate-400">Capture label
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. BRZ GLB only" maxLength={120}
            className="min-w-0 flex-1 rounded border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100" />
        </label>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {!map?.collider_chunks && <p className="mb-3 text-sm text-amber-300">Restart the updated Rust backend for collider metadata. Older servers show vehicle placeholders.</p>}
        <div className="grid gap-2 md:grid-cols-2">
          {rows.map((row, index) => <GameButton key={row.label.split(":")[0]} data-debug-row={index} selected={selectedRow === index}
            onFocus={() => setSelectedRow(index)} onPress={() => row.action()} className="rounded-lg px-3 py-2 text-xs">{row.label}</GameButton>)}
        </div>
        <CaptureResults />
        <VehicleAlignmentReadout />
        <p className="mt-3 text-xs text-slate-400">Δ = current mean − baseline mean. Repeat runs with the same camera and route. Feature costs depend on the other features enabled. CPU submit is browser work through render submission; GPU completion and physical input-to-display latency are unmeasured. Captures stay in this tab until export or reload.</p>
        <div className="mt-3 font-mono text-[11px] text-slate-400"><NetworkDiagnostics /></div>
      </div>
    </section>
  </div>;
}
function CaptureResults() {
  const { runs, status } = usePerformanceReadout();
  const ms = (value: number | null | undefined) => value === null || value === undefined ? "—" : value.toFixed(2);
  return <div className="mt-5 overflow-x-auto">
    <p className="mb-2 text-sm text-cyan-300" role="status">{status}</p>
    {runs.length > 0 && <table className="w-full whitespace-nowrap text-left font-mono text-xs">
      <thead className="text-slate-400"><tr>{["Capture", "Mean ms", "p95 ms", "p99 ms", "Δ baseline", "Δ previous", "Calls", "Ack ms"].map((h) => <th key={h} className="p-2">{h}</th>)}</tr></thead>
      <tbody>{runs.map((run, index) => {
        const baseline = runs.find((r) => r.id === run.baselineId);
        const previous = runs[index - 1];
        return <tr key={run.id} className="border-t border-slate-800"><td className="p-2">{run.baseline ? "★ " : ""}{run.label}</td>
          <td className="p-2">{ms(run.metrics.frameMs?.mean)}</td><td className="p-2">{ms(run.metrics.frameMs?.p95)}</td><td className="p-2">{ms(run.metrics.frameMs?.p99)}</td>
          <td className="p-2">{ms(difference(run.metrics.frameMs?.mean, baseline?.metrics.frameMs?.mean))}</td>
          <td className="p-2">{ms(difference(run.metrics.frameMs?.mean, previous?.metrics.frameMs?.mean))}</td>
          <td className="p-2">{ms(run.metrics.drawCalls?.mean)}</td><td className="p-2">{ms(run.metrics.inputAckMs?.mean)}</td></tr>;
      })}</tbody>
    </table>}
  </div>;
}

function VehicleAlignmentReadout() {
  const reports = useVisualAlignmentStore((s) => s.reports);
  const rows = Object.entries(reports);
  if (!rows.length) return null;
  return <div className="mt-4 overflow-x-auto text-xs text-slate-300">
    <p className="mb-2 font-bold text-cyan-300">GLB alignment · measured once from the imported asset</p>
    <table className="w-full text-left font-mono">
      <thead><tr>{["Model", "Reference", "Offset X/Y/Z (m)", "Wheel Y spread", "Status"].map((h) => <th key={h} className="p-2">{h}</th>)}</tr></thead>
      <tbody>{rows.map(([id, r]) => <tr key={id} className="border-t border-slate-800">
        <td className="p-2">{r.model} · {id.slice(0, 8)}</td><td className="p-2">{r.method}</td>
        <td className="p-2">{r.offset.map((v) => v.toFixed(3)).join(" / ")}</td>
        <td className="p-2">{(r.wheelSpreadY * 1000).toFixed(1)} mm</td><td className="p-2">{r.status}</td>
      </tr>)}</tbody>
    </table>
    <p className="mt-1 text-slate-400">Missing backend reference: rebuild/restart Rust. Missing asset reference: add CHASSIS_ANCHOR or identify wheel meshes. This aligns body height; orientation and model scale retain their imported values.</p>
  </div>;
}
