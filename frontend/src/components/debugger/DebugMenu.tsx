import { TabbedMenu, type MenuRow } from "../menus/TabbedMenu";
import { useUIStore } from "../../store/uiStore";
import { useWorldStore } from "../../store/worldStore";
import { useNetworkStore } from "../../store/networkStore";
import { useDebugViewStore } from "../../store/debugViewStore";
import { DebugFlags, hasDebugFlag } from "../../store/tools/debugMasks";
import { assetKey, chunkKey, useRenderSettingsStore, type VisualMode } from "../../store/renderSettingsStore";
import { difference, performanceRecorder as recorder } from "../../performance/measurements";
import { exportPerformanceCaptures, startPerformanceCapture } from "../../performance/captureActions";
import { useCaptureSettingsStore } from "../../performance/captureSettingsStore";
import { useVisualAlignmentStore } from "../../store/visualAlignmentStore";
import { usePerformanceReadout } from "../../performance/usePerformanceReadout";
import { cityQualityControl, cityViewDistanceControl, cityPerformanceControl, interpolationControl } from "../menus/cityQualityControl";

const MODES: VisualMode[] = ["collider", "geometry", "glb", "hybrid", "hidden"];
const DEBUG_OPTIONS = [
  ["Chassis", DebugFlags.CHASSIS], ["Wheels", DebugFlags.WHEELS],
  ["Suspension Rays", DebugFlags.RAYS], ["Slip Vectors", DebugFlags.SLIP],
  ["Load Bars", DebugFlags.LOAD_BARS], ["Anti-Roll Bars", DebugFlags.ARB],
  ["Block Colliders", DebugFlags.BLOCKS],
] as const;
const ALL_DEBUG = DEBUG_OPTIONS.reduce((mask, [, flag]) => mask | flag, 0);
const step = <T,>(values: readonly T[], value: T, dir: 1 | -1 = 1): T => values[(Math.max(0, values.indexOf(value)) + dir + values.length) % values.length];

export function DebugMenu() {
  const settings = useRenderSettingsStore();
  const mode = useWorldStore((s) => s.mode);
  const mask = useWorldStore((s) => s.debugMask);
  const map = useWorldStore((s) => s.map);
  const debug = useDebugViewStore();
  const back = useUIStore((s) => s.backToParentMenu);
  // Entity poses update at network rate; menu membership changes much less often.
  const rosterKey = useNetworkStore((s) => JSON.stringify((s.snapshot?.entities ?? []).map((e) => [e.id, e.vehicle_id])));
  const captureSettings = useCaptureSettingsStore();
  const label = captureSettings.label;
  const duration = captureSettings.seconds;
  const world = useWorldStore.getState();
  const capture = (baseline: boolean) => {
    startPerformanceCapture(baseline, true);
  };
  const overlayRow: MenuRow = {
    id: "performance-overlay", label: settings.overlay ? "Close performance overlay" : "Open performance overlay", value: "F3", adjustable: false,
    action: () => {
      settings.update({ overlay: !settings.overlay });
      if (!settings.overlay) useUIStore.getState().closeOverlay();
    },
  };
  const renderToggles = (["shadows", "reflections", "stars", "fog", "vehicleLights", "hud"] as const).map((key): MenuRow => ({
    id: key, label: ({ shadows: "Shadows", reflections: "HDR reflections", stars: "Animated stars", fog: "Fog", vehicleLights: "Vehicle spotlights", hud: "Driving HUD + terminal" })[key],
    value: settings[key] ? "On" : "Off", action: () => settings.update({ [key]: !settings[key] }),
  }));
  const environmentRows = (map?.chunks ?? []).flatMap((chunk): MenuRow[] => {
    const key = chunkKey(chunk.x, chunk.z);
    const chunkMode = settings.chunkOverrides[key] ?? settings.environmentMode;
    return [
      { id: `chunk-${key}`, label: `City chunk ${key}`, value: chunkMode.toUpperCase(), action: (dir) => settings.setChunkMode(key, step(MODES, chunkMode, dir)) },
      ...(map?.visuals ?? []).map((visual): MenuRow => {
        const asset = assetKey(chunk.x, chunk.z, visual.id);
        const enabled = settings.assetGlbs[asset] ?? (chunkMode === "glb" || chunkMode === "hybrid");
        return { id: `asset-${asset}`, label: `GLB asset ${asset}`, value: enabled ? "On" : "Off", action: () => settings.setAssetGlb(asset, !enabled) };
      }),
    ];
  });
  return <TabbedMenu title="Debugger" eyebrow="REDLINE VECTOR / ENGINE TOOLS" onBack={back} subtitle="Inspect physics, isolate visual cost and compare driving captures. Live latency stats appear in the performance overlay." tabs={[
    { id: "visualizers", label: "Visualizers", description: "Diagnostic streams are separate from model rendering. Disable streams you do not need to reduce debug traffic.", rows: [
      overlayRow,
      { id: "scope", label: "Diagnostic player scope", value: debug.playerScope.toUpperCase(), action: () => debug.togglePlayerScope() },
      { id: "all-streams", label: "All diagnostic streams", value: (mask & ALL_DEBUG) === ALL_DEBUG ? "On" : "Off", adjustable: false, action: () => world.setDebugMask((useWorldStore.getState().debugMask & ALL_DEBUG) === ALL_DEBUG ? 0 : ALL_DEBUG) },
      ...DEBUG_OPTIONS.map(([name, flag]): MenuRow => ({ id: `debug-${flag}`, label: `${name} diagnostics`, value: hasDebugFlag(mask, flag) ? "On" : "Off", adjustable: false, action: () => world.toggleDebugFlag(flag) })),
    ] },
    { id: "vehicles", label: "Vehicles & GLBs", description: "Choose each vehicle's representation independently. These options change the rendering, while collision and simulation stay authoritative on the server.", rows: [
      { id: "vehicle-default", label: "Vehicles default", value: mode.toUpperCase(), action: (dir) => { world.setMode(step(["collider", "geometry", "glb", "hybrid"] as const, mode, dir)); settings.update({ vehicleOverrides: {} }); } },
      { id: "alignment", label: "Automatic GLB alignment", value: settings.autoVehicleAlignment ? "On" : "Off", action: () => settings.update({ autoVehicleAlignment: !settings.autoVehicleAlignment }) },
      ...(JSON.parse(rosterKey) as [string, string | null][]).map(([id, vehicle]): MenuRow => ({ id: `vehicle-${id}`, label: `Vehicle ${vehicle ?? "unknown"} · ${id.slice(0, 8)}`, value: (settings.vehicleOverrides[id] ?? mode).toUpperCase(), action: (dir) => settings.setVehicleMode(id, step(MODES, settings.vehicleOverrides[id] ?? mode, dir)) })),
    ], content: <VehicleAlignmentReadout /> },
    { id: "environment", label: "Environment", description: "Set a world default, override a chunk, or switch individual GLB assets. The list is populated from the server's selected map.", rows: [
      { id: "environment-default", label: "Environment default", value: settings.environmentMode.toUpperCase(), action: (dir) => settings.update({ environmentMode: step(MODES, settings.environmentMode, dir), chunkOverrides: {}, assetGlbs: {} }) },
      cityQualityControl(settings),
      cityViewDistanceControl(settings),
      cityPerformanceControl(settings),
      { id: "opaque-city", label: "Opaque city materials (Original A/B)", value: settings.cityQuality !== "original" ? "City detail preset" : settings.opaqueCityMaterials ? "On" : "Off", disabled: settings.cityQuality !== "original", action: () => settings.update({ opaqueCityMaterials: !settings.opaqueCityMaterials }) },
      ...environmentRows,
    ], content: !map?.collider_chunks && <p className="mt-1 text-xs text-amber-300">Collider metadata is unavailable. Connect to the updated Rust backend to inspect city chunks.</p> },
    { id: "rendering", label: "Rendering", description: "These controls share the same settings as Display. Captures can help compare the cost of one effect at a time.", rows: [
      interpolationControl(debug),
      { id: "dpr", label: "Resolution scale", value: `${settings.dpr}×`, action: (dir) => settings.update({ dpr: step([0.5, 0.75, 1, 1.5, 2], settings.dpr, dir) }) },
      cityQualityControl(settings),
      cityViewDistanceControl(settings),
      ...renderToggles,
      { id: "overlay", label: "Performance overlay", value: settings.overlay ? "On" : "Off", action: () => settings.update({ overlay: !settings.overlay }) },
    ] },
    { id: "captures", label: "Captures", description: "Start with a collider baseline. Captures resume gameplay, warm up for 3 seconds and record frame / network metrics. Repeat the same camera and route for useful comparisons.", rows: [
      overlayRow,
      { id: "baseline-reset", label: "Reset to collider graphics baseline", action: () => { recorder.cancel("Baseline reset"); settings.baseline(); } },
      { id: "duration", label: "Capture length", value: `${duration}s + 3s warm-up`, action: (dir) => captureSettings.update({ seconds: step([5, 10, 20], duration, dir) }) },
      { id: "baseline", label: "Record baseline & resume", action: () => capture(true) },
      { id: "compare", label: "Record comparison & resume", action: () => capture(false) },
      { id: "cancel", label: "Cancel capture", action: () => recorder.cancel() },
      { id: "csv", label: "Export captures as CSV", action: () => exportPerformanceCaptures("csv") },
      { id: "json", label: "Export captures as JSON", action: () => exportPerformanceCaptures("json") },
      { id: "clear", label: "Clear captures", danger: true, action: () => recorder.clear() },
    ], content: <><label className="menu-field">Optional capture label<input value={label} onChange={(event) => captureSettings.update({ label: event.target.value })} placeholder="e.g. BRZ GLB only" maxLength={120} className="menu-input" /></label><CaptureResults /><p className="mt-1 text-xs leading-tight text-slate-400">Up to 20 completed captures save in this browser across reloads. Export JSON for frame samples and route coordinates; CSV contains the comparison summary. CPU submit excludes GPU completion; physical input-to-display latency is unmeasured.</p></> },
  ]} />;
}
function CaptureResults() {
  const { runs, status } = usePerformanceReadout();
  const ms = (value: number | null | undefined) => value === null || value === undefined ? "—" : value.toFixed(2);
  return <div className="mt-1 overflow-x-auto">
    <p className="mb-1 text-xs text-cyan-300" role="status">{status}</p>
    {runs.length > 0 && <table className="menu-table w-full whitespace-nowrap text-left font-mono text-xs">
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
  return <div className="mt-1 overflow-x-auto text-xs text-slate-300">
    <p className="mb-1 font-bold text-cyan-300">GLB alignment · measured once from the imported asset</p>
    <table className="menu-table w-full text-left font-mono">
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
