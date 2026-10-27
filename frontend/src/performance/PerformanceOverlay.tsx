import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { inputRef, useInputStore } from "../store/inputStore";
import { useRenderSettingsStore } from "../store/renderSettingsStore";
import { useDebugViewStore } from "../store/debugViewStore";
import { useUIStore } from "../store/uiStore";
import { useWorldStore } from "../store/worldStore";
import { useNetworkStore } from "../store/networkStore";
import { useCanDataStore } from "../store/canDataStore";
import { isTypingTarget, type MenuAction } from "../store/tools/inputRouting";
import { getInputSenderStats } from "../net/rustSocket";
import { DEFAULT_INTERPOLATION_DELAY_MS } from "../hooks/usePhysicsInterpolator";
import { usePerformanceReadout } from "./usePerformanceReadout";
import { difference, performanceRecorder as recorder } from "./measurements";
import { useCaptureSettingsStore } from "./captureSettingsStore";
import { automaticCaptureLabel, exportPerformanceCaptures, startPerformanceCapture, togglePerformanceCapture } from "./captureActions";
import { closePerformanceOverlay, minimizePerformanceOverlay, PERFORMANCE_TABS, performanceOverlayHasFocus, usePerformanceOverlayStore } from "./performanceOverlayStore";
import { spawnJson } from "./location";
import { cityStreamingStats } from "../world/cityWorkQueue";
import { cityAssetVisible, cityTextureAsset, CITY_QUALITY_LABELS } from "../world/cityLod";
import { cityBlockAsset, CITY_REDUCED_ASSET } from "../world/cityBlocks";
import { resolveCityViewDistance } from "../world/cityViewDistance";
import "./performanceOverlay.css";

const format = (value: number | null | undefined, digits = 1) => value === undefined || value === null ? "—" : value.toFixed(digits);
const TAB_LABELS = { position: "Position", network: "Network / Physics", assets: "City Assets" };

export function PerformanceOverlay() {
  const enabled = useRenderSettingsStore(s => s.overlay);
  useEffect(() => {
    const normalize = () => {
      const ui = useUIStore.getState();
      if (!useRenderSettingsStore.getState().overlay || ui.screen !== "sandbox" || ui.overlay !== null
        || ui.isModeLoading || useCanDataStore.getState().commandOpen) minimizePerformanceOverlay();
    };
    const ui = useUIStore.subscribe(normalize), render = useRenderSettingsStore.subscribe(normalize), can = useCanDataStore.subscribe(normalize);
    window.addEventListener("blur", minimizePerformanceOverlay);
    return () => { ui(); render(); can(); window.removeEventListener("blur", minimizePerformanceOverlay); minimizePerformanceOverlay(); };
  }, []);
  // Compact mode still records everything, but renders no hidden diagnostics.
  return enabled ? <Readout /> : null;
}
function DataRows({ rows }: { rows: [string, ReactNode][] }) {
  return <dl className="perf-stats">{rows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>;
}
function Readout() {
  const panel = usePerformanceOverlayStore();
  const stats = usePerformanceReadout(panel.expanded);
  const capture = useCaptureSettingsStore();
  const rendering = useRenderSettingsStore();
  const interpolation = useDebugViewStore(s => s.interpolationEnabled);
  const map = useWorldStore(s => s.map);
  const connected = useNetworkStore(s => s.connected);
  const overlay = useUIStore(s => s.overlay);
  const [exportOpen, setExportOpen] = useState(false), [copyStatus, setCopyStatus] = useState("");
  const root = useRef<HTMLElement>(null), pointerOwner = useRef<Element | null>(null);
  const id = useId(), city = cityStreamingStats(), sender = getInputSenderStats(), network = useNetworkStore.getState();
  const input = inputRef.current, m = stats.metrics, location = stats.location;
  const spawn = location ? spawnJson(location) : null;
  const last = stats.runs.at(-1), baseline = stats.runs.find(run => run.id === stats.baselineId);
  const delta = difference(last?.metrics.frameMs?.mean, baseline?.metrics.frameMs?.mean);
  const range = resolveCityViewDistance(rendering.cityQuality, rendering.cityViewDistance);
  const modelAssets = (map?.visuals ?? []).filter(visual => map?.chunks.some(chunk =>
    cityAssetVisible(chunk, visual, rendering.environmentMode, rendering.chunkOverrides, rendering.assetGlbs)));
  const record = () => recorder.capturing ? togglePerformanceCapture() : startPerformanceCapture(undefined, true);
  const copySpawn = async () => {
    if (!spawn) return;
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(spawn); setCopyStatus("Spawn copied · yaw in radians");
    } catch { setCopyStatus("Clipboard unavailable · use these coordinates"); }
  };
  useEffect(() => {
    if (panel.focused) root.current?.querySelector<HTMLElement>('[data-performance-control="record"]')?.focus({ preventScroll: true });
  }, [panel.focused]);
  useEffect(() => {
    if (exportOpen) root.current?.querySelector<HTMLElement>('[data-performance-control="export-csv"]')?.focus({ preventScroll: true });
  }, [exportOpen]);
  useEffect(() => usePerformanceOverlayStore.subscribe(state => { if (!state.expanded) setExportOpen(false); }), []);
  useEffect(() => {
    if (!exportOpen) return;
    const close = (event: PointerEvent) => { if (event.target && !root.current?.contains(event.target as Node)) setExportOpen(false); };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [exportOpen]);
  useEffect(() => {
    const handler = (event: Event) => {
      const element = root.current; if (!element || (!performanceOverlayHasFocus() && !element.contains(document.activeElement))) return;
      const action = (event as CustomEvent<MenuAction>).detail;
      const focus = (target: HTMLElement | null | undefined) => { target?.focus({ preventScroll: true }); target?.scrollIntoView({ block: "nearest", inline: "nearest" }); };
      const controls = [...element.querySelectorAll<HTMLElement>("[data-performance-control]:not(:disabled)")];
      const current = document.activeElement as HTMLElement | null;
      if (action === "back") {
        if (exportOpen) { setExportOpen(false); focus(element.querySelector<HTMLElement>('[data-performance-control="export"]')); }
        else minimizePerformanceOverlay();
        return;
      }
      if (action === "previous_tab" || action === "next_tab" || ((action === "left" || action === "right") && current?.getAttribute("role") === "tab")) {
        const direction = action === "previous_tab" || action === "left" ? -1 : 1;
        const next = PERFORMANCE_TABS[(PERFORMANCE_TABS.indexOf(usePerformanceOverlayStore.getState().tab) + direction + PERFORMANCE_TABS.length) % PERFORMANCE_TABS.length];
        usePerformanceOverlayStore.getState().setTab(next); setExportOpen(false);
        focus(element.querySelector<HTMLElement>(`[data-performance-tab="${next}"]`)); return;
      }
      if ((action === "left" || action === "right") && current?.dataset.performanceControl === "length") {
        const s = useCaptureSettingsStore.getState(), values = [5, 10, 20], direction = action === "left" ? -1 : 1;
        s.update({ seconds: values[(values.indexOf(s.seconds) + direction + 3) % 3] }); return;
      }
      if (action === "activate") { current?.click(); return; }
      const direction = action === "up" || action === "left" ? -1 : 1;
      focus(controls[(Math.max(0, controls.indexOf(current!)) + direction + controls.length) % controls.length]);
    };
    window.addEventListener("avenlab:performance-action", handler);
    return () => window.removeEventListener("avenlab:performance-action", handler);
  }, [exportOpen]);

  const countdown = stats.progress.phase === "recording" ? `RECORDING · ${(stats.progress.remainingMs / 1000).toFixed(1)} s LEFT`
    : stats.progress.phase === "warmup" ? `STARTS IN ${(stats.progress.remainingMs / 1000).toFixed(1)} s` : stats.status;
  const storageFailed = /failed|unavailable/i.test(stats.storageStatus);
  const notice = stats.capturing || /^(Discarded|Not saved)/.test(stats.status) || storageFailed;
  return <aside ref={root} data-performance-overlay data-expanded={panel.expanded} data-controller-focus={panel.focused}
    className="perf-overlay pointer-events-auto" aria-label="Performance overlay"
    onPointerDownCapture={event => { pointerOwner.current = (event.target as Element).closest("button"); }}
    onClickCapture={event => {
      const button = (event.target as Element).closest("button");
      if (event.detail > 0 && button && button !== pointerOwner.current) { event.preventDefault(); event.stopPropagation(); }
      pointerOwner.current = null;
    }}
    onPointerDown={event => event.stopPropagation()} onWheel={event => event.stopPropagation()}
    onKeyDownCapture={event => {
      if (event.code === "Escape") { event.preventDefault(); event.stopPropagation(); window.dispatchEvent(new CustomEvent("avenlab:performance-action", { detail: "back" })); return; }
      if (isTypingTarget(event.target)) return;
      const actions: Record<string, MenuAction> = { ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right", Enter: "activate", Space: "activate", PageUp: "previous_tab", PageDown: "next_tab" };
      const action = actions[event.code];
      if (action) { event.preventDefault(); event.stopPropagation(); if (!event.repeat) window.dispatchEvent(new CustomEvent("avenlab:performance-action", { detail: action })); }
    }}>
    <form className="perf-toolbar" onSubmit={event => { event.preventDefault(); record(); }}>
      <label className="perf-name"><span>NAME</span><input data-performance-control="name" aria-label="Capture label"
        value={capture.label} disabled={stats.capturing} maxLength={120} placeholder="Auto name" title={automaticCaptureLabel()}
        onFocus={() => useInputStore.getState().releaseControls()} onChange={event => capture.update({ label: event.target.value })} /></label>
      <button type="button" data-performance-control="record" aria-label={stats.capturing ? "Stop recording" : "Start recording"} aria-keyshortcuts="F8"
        title="Start / stop · F8 · A / Cross" onClick={record} className="menu-control perf-control perf-record">{stats.capturing ? "STOP" : "START"} <kbd aria-hidden="true">A</kbd></button>
      <button type="button" data-performance-control="export" aria-label="Export captures" aria-expanded={exportOpen} aria-controls={`${id}-export`}
        disabled={!stats.runs.length} onClick={() => setExportOpen(value => !value)} title={`Export ${stats.runs.length} saved captures`}
        className="menu-control perf-control">EXPORT <span className="perf-count" aria-hidden="true">{stats.runs.length}</span></button>
      <button type="button" data-performance-control="details" aria-label={panel.expanded ? "Minimize diagnostics" : "Open diagnostics"}
        aria-expanded={panel.expanded} title="Diagnostics · View/Select · Shift+F3"
        onClick={() => panel.expanded ? minimizePerformanceOverlay() : panel.expand()}
        className="menu-control perf-control">{panel.expanded ? "MIN" : "OPEN"} <kbd aria-hidden="true">VIEW</kbd></button>
      <button type="button" data-performance-control="close" onClick={closePerformanceOverlay} aria-label="Close performance overlay" title="Close · F3" className="menu-control perf-control perf-close">×</button>
    </form>
    {exportOpen && <div id={`${id}-export`} className="perf-export" aria-label="Export format">
      <button type="button" data-performance-control="export-csv" onClick={() => { exportPerformanceCaptures("csv"); setExportOpen(false); root.current?.querySelector<HTMLElement>('[data-performance-control="export"]')?.focus(); }} className="menu-control perf-control">EXPORT CSV</button>
      <button type="button" data-performance-control="export-json" onClick={() => { exportPerformanceCaptures("json"); setExportOpen(false); root.current?.querySelector<HTMLElement>('[data-performance-control="export"]')?.focus(); }} className="menu-control perf-control">EXPORT JSON</button>
    </div>}
    {notice && <p role={stats.capturing ? "timer" : "status"} aria-label="Capture countdown" className="perf-notice text-red-400">{!stats.capturing && storageFailed ? stats.storageStatus : countdown}</p>}
    {panel.expanded && <>
      <div role="tablist" aria-label="Performance details" className="perf-tabs">
        {PERFORMANCE_TABS.map(tab => <button type="button" key={tab} role="tab" id={`${id}-${tab}`} aria-controls={`${id}-panel`}
          aria-selected={panel.tab === tab} tabIndex={panel.tab === tab ? 0 : -1} data-performance-tab={tab} data-performance-control={`tab-${tab}`}
          data-selected={panel.tab === tab} className="menu-control perf-control" onClick={() => panel.setTab(tab)}>{TAB_LABELS[tab]}</button>)}
      </div>
      <div role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-${panel.tab}`} className="perf-body">
        {panel.tab === "position" && <>
          <div className="perf-section-title"><strong>PLAYER POSITION · METERS</strong>
            <button type="button" data-performance-control="spawn" disabled={!spawn} onClick={copySpawn} className="menu-control perf-control">COPY SPAWN</button></div>
          <p>X {format(location?.position[0], 3)} · Y {format(location?.position[1], 3)} · Z {format(location?.position[2], 3)}</p>
          <p>CHUNK {location?.chunk?.join(", ") ?? "—"} · LOCAL X {format(location?.local?.[0], 3)} / Z {format(location?.local?.[2], 3)}</p>
          <p>YAW {format(location?.yaw, 3)} rad / {format(location ? location.yaw * 180 / Math.PI : null)}°</p>
          <p>{network.getMe()?.vehicle_id?.toUpperCase() ?? "NO PLAYER"} · SPEED {format(network.getMe()?.speed, 2)} m/s</p>
          {copyStatus && <p role="status" className="perf-info">{copyStatus}</p>}
        </>}
        {panel.tab === "network" && <>
          <p className="perf-info">{connected ? "CONNECTED" : "DISCONNECTED"} · LIVE 5 s WINDOW</p>
          <DataRows rows={[
            ["FPS / frame mean", `${format(m.frameMs ? 1000 / m.frameMs.mean : null, 0)} / ${format(m.frameMs?.mean)} ms`],
            ["Frame p95 / p99", `${format(m.frameMs?.p95)} / ${format(m.frameMs?.p99)} ms`],
            ["CPU submit mean / p95", `${format(m.cpuSubmitMs?.mean)} / ${format(m.cpuSubmitMs?.p95)} ms`],
            ["Input acknowledgement", `${format(m.inputAckMs?.mean)} ms`],
            ["RTT / snapshot age", `${format(m.rttMs?.mean)} / ${format(m.receiptAgeMs?.mean)} ms`],
            ["Snapshot interval / p95", `${format(m.arrivalMs?.mean)} / ${format(m.arrivalMs?.p95)} ms`],
            ["JSON decode / p95", `${format(m.decodeMs?.mean, 2)} / ${format(m.decodeMs?.p95, 2)} ms`],
            ["Snapshots / debug", `${format(stats.snapshotKiBps)} / ${format(stats.debugKiBps)} KiB/s`],
            ["Server physics / work p95", `${format(m.serverPhysicsMs?.p95, 2)} / ${format(m.serverWorkMs?.p95, 2)} ms`],
            ["Server lock p95 / input queue", `${format(m.serverLockMs?.p95, 2)} ms / ${sender.queuedBytes} B`],
            ["Pending / oldest input", `${sender.pendingInputs} / ${format(sender.oldestPendingMs)} ms`],
            ["Tick / debug tick", `${network.tick ?? "—"} / ${network.debugTick ?? "—"}`],
            ["Sender / sent / skipped", `${sender.running ? "ON" : "OFF"} / ${sender.sent} / ${sender.skipped}`],
            ["Snapshot / debug payload", `${sender.snapshotChars} / ${sender.debugChars} chars`],
            ["Peak decode / ack seq", `${format(sender.worstDecodeMs, 2)} ms / ${sender.acknowledgedInputSeq ?? "—"}`],
            ["Throttle / brake / handbrake", `${format(input.throttle, 2)} / ${format(input.brake, 2)} / ${format(input.handbrake, 2)}`],
            ["Interpolation buffer", `${interpolation ? DEFAULT_INTERPOLATION_DELAY_MS : 0} ms`],
            ["Body roll mean / p95", `${format(m.bodyRollDeg?.mean)} / ${format(m.bodyRollDeg?.p95)}°`],
            ["Airborne tires / p95", `${format(m.airborneWheels?.mean)} / ${format(m.airborneWheels?.p95, 0)}`],
          ]} />
          <p className="perf-muted">CPU submit excludes GPU completion. Ack excludes display/interpolation.</p>
          {last && <p className="perf-info">LAST: {last.label}{last.stoppedEarly ? " · STOPPED EARLY" : ""}{delta !== null && ` · Δ ${delta >= 0 ? "+" : ""}${format(delta)} ms`}</p>}
        </>}
        {panel.tab === "assets" && <>
          <p className="perf-info">{CITY_QUALITY_LABELS[rendering.cityQuality]} · {Number.isFinite(range) ? `${range} M` : "ALL LOADED"} · DPR {rendering.dpr}</p>
          <p>SHADOWS {rendering.shadows ? "ON" : "OFF"} · REFLECTIONS {rendering.reflections ? "ON" : "OFF"}</p>
          <DataRows rows={[
            ["Model / silhouette chunks", `${city.detailed} / ${city.proxies}`],
            ["Preparations / long task p95", `${city.pending} / ${format(m.longTaskMs?.p95)} ms`],
            ["Draw calls / triangles", `${format(m.drawCalls?.mean, 0)} / ${format(m.triangles?.mean, 0)}`],
            ["Geometries / textures", `${format(m.geometries?.mean, 0)} / ${format(m.textures?.mean, 0)}`],
          ]} />
          {city.pending > 0 && <p role="status" className="perf-info">{city.phase}</p>}
          <strong>RESOLVED CITY MODEL URLS</strong>
          {!modelAssets.length && <p>No city GLBs enabled.</p>}
          {modelAssets.map(visual => <p key={visual.id} className="perf-asset">{visual.id}: {cityTextureAsset(visual.asset, rendering.cityQuality)}</p>)}
          {rendering.cityQuality !== "original" && modelAssets.some(visual => cityBlockAsset(visual.asset)) && <p className="perf-asset">reduced: {CITY_REDUCED_ASSET}</p>}
          <button type="button" data-performance-control="materials" disabled={stats.capturing || rendering.cityQuality !== "original"}
            aria-pressed={rendering.cityQuality !== "original" || rendering.opaqueCityMaterials}
            onClick={() => rendering.update({ opaqueCityMaterials: !rendering.opaqueCityMaterials })} className="menu-control perf-control">
            OPAQUE CITY MATERIALS · {rendering.cityQuality === "original" ? rendering.opaqueCityMaterials ? "ON" : "OFF" : "PRESET"}
          </button>
          {!map?.collider_chunks && <p className="perf-notice">Collider metadata unavailable.</p>}
        </>}
      </div>
      <div className="perf-options">
        <button type="button" data-performance-control="length" aria-label="Capture length" disabled={stats.capturing}
          onClick={() => { const s = useCaptureSettingsStore.getState(); s.update({ seconds: [5, 10, 20][([5, 10, 20].indexOf(s.seconds) + 1) % 3] }); }} className="menu-control perf-control">{capture.seconds}s</button>
        <button type="button" data-performance-control="baseline" aria-pressed={capture.asBaseline} disabled={stats.capturing}
          onClick={() => capture.update({ asBaseline: !capture.asBaseline })} className="menu-control perf-control">BASELINE {capture.asBaseline ? "ON" : "OFF"}</button>
        {stats.capturing && <button type="button" data-performance-control="discard" onClick={() => recorder.cancel("Discarded by player")} className="menu-control perf-control">DISCARD</button>}
        <span className="perf-muted">{stats.storageStatus}</span>
      </div>
      {panel.focused && <p className="perf-help">D-PAD NAVIGATE · LB/RB TABS · A SELECT · B / VIEW MINIMIZE</p>}
      {overlay && <p className="perf-notice">Menu open · capture waits for gameplay.</p>}
    </>}
  </aside>;
}
