import type { PlayerLocation } from "./location";

// No React/store writes in the frame or packet hot paths. Bounded numeric rings
// keep the profiler's own cost stable, even during a long driving session.
export const METRICS = ["frameMs", "cpuSubmitMs", "drawCalls", "triangles", "geometries", "textures",
  "receiptAgeMs", "inputAckMs", "rttMs", "arrivalMs", "decodeMs", "queuedBytes",
  "serverLockMs", "serverPhysicsMs", "serverWorkMs", "bodyRollDeg", "airborneWheels"] as const;
export type Metric = typeof METRICS[number];
export type Summary = { count: number; mean: number; p50: number; p95: number; p99: number; stddev: number };
export type Summaries = Partial<Record<Metric, Summary>>;
export type ExperimentContext = { key: string; settings: Record<string, unknown>; ready: boolean; reason: string; location?: PlayerLocation | null };
export type CapturePoint = { timeMs: number; location: PlayerLocation | null; metrics: Partial<Record<Metric, number>> };
export type Capture = {
  id: number; label: string; baseline: boolean; startedAt: string; durationMs: number;
  settings: Record<string, unknown>; metrics: Summaries;
  snapshotKiBps: number; debugKiBps: number; snapshotHz: number;
  slowFrames: number; frameCount: number; baselineId: number | null;
  startLocation?: PlayerLocation | null; endLocation?: PlayerLocation | null;
  frameSamplesMs?: number[]; timeline?: CapturePoint[];
};
export function summarize(values: number[]): Summary | undefined {
  if (!values.length) return undefined;
  const ordered = [...values].sort((a, b) => a - b);
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const quantile = (p: number) => ordered[Math.max(0, Math.ceil(p * ordered.length) - 1)];
  return { count: values.length, mean, p50: quantile(0.5), p95: quantile(0.95), p99: quantile(0.99),
    stddev: Math.sqrt(values.reduce((sum, x) => sum + (x - mean) ** 2, 0) / values.length) };
}
export function difference(current: number | undefined, reference: number | undefined) {
  return current === undefined || reference === undefined ? null : current - reference;
}
class Series {
  private values = new Float64Array(8192);
  private times = new Float64Array(8192);
  private cursor = 0;
  private count = 0;
  add(value: number, time: number) {
    if (!Number.isFinite(value) || value < 0) return;
    this.values[this.cursor] = value; this.times[this.cursor] = time;
    this.cursor = (this.cursor + 1) % this.values.length;
    this.count = Math.min(this.count + 1, this.values.length);
  }
  since(time: number) {
    const result: number[] = [];
    for (let i = 0; i < this.count; i++) if (this.times[i] >= time) result.push(this.values[i]);
    return result;
  }
}

type Pending = { label: string; baseline: boolean; key: string; settings: Record<string, unknown>;
  requestedMs: number; warmSince: number | null; startMs: number | null; durationMs: number;
  samples: Partial<Record<Metric, number[]>>; snapshots: number; snapshotBytes: number; debugBytes: number;
  startedAt: string | null; startLocation: PlayerLocation | null; timeline: CapturePoint[]; lastPointMs: number };
export type CaptureProgress = { phase: "idle" | "waiting" | "warmup" | "recording"; label: string; remainingMs: number };
export class PerformanceRecorder {
  enabled = false;
  runs: Capture[] = [];
  baselineId: number | null = null;
  status = "Ready";
  storageStatus = "Export JSON to share captures.";
  private archiveListeners = new Set<() => void>();
  private nextId = 1;
  private pending: Pending | null = null;
  private series = Object.fromEntries(METRICS.map((name) => [name, new Series()])) as Record<Metric, Series>;
  private traffic: { time: number; snapshot: number; debug: number }[] = [];
  get capturing() { return this.pending !== null; }
  progress(now = performance.now()): CaptureProgress {
    const p = this.pending;
    if (!p) return { phase: "idle", label: "", remainingMs: 0 };
    if (p.startMs !== null) return { phase: "recording", label: p.label, remainingMs: Math.max(0, p.durationMs - now + p.startMs) };
    if (p.warmSince !== null) return { phase: "warmup", label: p.label, remainingMs: Math.max(0, 3000 - now + p.warmSince) };
    return { phase: "waiting", label: p.label, remainingMs: 0 };
  }
  subscribeArchive(listener: () => void) { this.archiveListeners.add(listener); return () => { this.archiveListeners.delete(listener); }; }
  restore(runs: Capture[], baselineId: number | null) {
    if (this.pending || this.runs.length) return;
    this.runs = runs.slice(-50);
    this.baselineId = this.runs.some((r) => r.id === baselineId) ? baselineId : null;
    this.nextId = Math.max(0, ...this.runs.map((r) => r.id)) + 1;
    if (this.runs.length) this.status = `Restored ${this.runs.length} captures`;
  }
  private archiveChanged() { for (const listener of this.archiveListeners) listener(); }
  record(metric: Metric, value: number | null | undefined, now = performance.now()) {
    if ((!this.enabled && !this.pending) || value === null || value === undefined || !Number.isFinite(value) || value < 0) return;
    this.series[metric].add(value, now);
    const p = this.pending;
    if (p && p.startMs !== null && now >= p.startMs && now <= p.startMs + p.durationMs) {
      const samples = p.samples[metric] ??= [];
      // A maximum of 20 seconds at 240 Hz plus packet samples stays bounded.
      if (samples.length < 16384) samples.push(value);
    }
  }
  packet(kind: string, bytes: number, decodeMs: number, now: number) {
    if (!this.enabled && !this.pending) return;
    this.record("decodeMs", decodeMs, now);
    if (kind !== "snapshot" && kind !== "debug") return;
    this.traffic.push({ time: now, snapshot: kind === "snapshot" ? bytes : 0, debug: kind === "debug" ? bytes : 0 });
    if (this.traffic.length > 4096) this.traffic.splice(0, 2048);
    const p = this.pending;
    if (p && p.startMs !== null && now >= p.startMs && now <= p.startMs + p.durationMs) {
      if (kind === "snapshot") { p.snapshots++; p.snapshotBytes += bytes; }
      else p.debugBytes += bytes;
    }
  }
  live(now = performance.now()) {
    const metrics: Summaries = {};
    for (const metric of METRICS) metrics[metric] = summarize(this.series[metric].since(now - 5000));
    const traffic = this.traffic.filter((p) => p.time >= now - 5000);
    // Fixed five-second trailing window; allow five seconds after enabling.
    return { metrics, snapshotKiBps: traffic.reduce((sum, p) => sum + p.snapshot, 0) / 5120,
      debugKiBps: traffic.reduce((sum, p) => sum + p.debug, 0) / 5120,
      snapshotHz: traffic.filter((p) => p.snapshot > 0).length / 5 };
  }
  start(label: string, baseline: boolean, seconds: number, context: ExperimentContext, now = performance.now()) {
    if (this.pending) return;
    this.pending = { label: label.trim().slice(0, 120) || (baseline ? "Baseline" : "Feature comparison"), baseline,
      key: context.key, settings: context.settings, requestedMs: now, warmSince: null,
      startMs: null, durationMs: Math.min(20, Math.max(5, Number.isFinite(seconds) ? seconds : 10)) * 1000,
      samples: {}, snapshots: 0, snapshotBytes: 0, debugBytes: 0,
      startedAt: null, startLocation: null, timeline: [], lastPointMs: -Infinity };
    this.status = "Waiting for gameplay and assets";
  }
  cancel(reason = "Cancelled") { this.pending = null; this.status = reason; }
  tick(context: ExperimentContext, now = performance.now()) {
    const p = this.pending;
    if (!p) return;
    if (context.key !== p.key) { this.cancel("Discarded: settings, map, camera or roster changed"); return; }
    if (!context.ready) {
      if (p.startMs !== null) { this.cancel(`Discarded: ${context.reason}`); return; }
      p.warmSince = null;
      this.status = `Waiting: ${context.reason}`;
      if (now - p.requestedMs > 60000) this.cancel("Discarded: warm-up timed out");
      return;
    }
    if (p.warmSince === null) p.warmSince = now;
    if (p.startMs === null) {
      if (now - p.warmSince < 3000) { this.status = `Warming up: ${Math.ceil((3000 - now + p.warmSince) / 1000)} s`; return; }
      p.startMs = now;
      p.startedAt = new Date().toISOString();
      p.startLocation = context.location ?? null;
      p.settings = context.settings;
    }
    const elapsed = now - p.startMs;
    if (elapsed <= p.durationMs && now - p.lastPointMs >= 100 && p.timeline.length < 201) {
      const metrics: Partial<Record<Metric, number>> = {};
      for (const metric of METRICS) {
        const value = p.samples[metric]?.at(-1);
        if (value !== undefined) metrics[metric] = Number(value.toFixed(3));
      }
      p.timeline.push({ timeMs: Math.round(elapsed), location: context.location ?? null, metrics });
      p.lastPointMs = now;
    }
    this.status = `Recording ${p.label}: ${Math.max(0, (p.durationMs - elapsed) / 1000).toFixed(1)} s`;
    if (elapsed < p.durationMs) return;
    const frameCount = p.samples.frameMs?.length ?? 0;
    if (frameCount < 30 || p.snapshots === 0) { this.cancel("Discarded: insufficient frames or snapshots"); return; }
    const metrics: Summaries = {};
    for (const metric of METRICS) metrics[metric] = summarize(p.samples[metric] ?? []);
    const id = this.nextId++;
    if (p.baseline) this.baselineId = id;
    this.runs.push({ id, label: p.label, baseline: p.baseline, startedAt: p.startedAt!,
      durationMs: p.durationMs, settings: { ...p.settings, endPlayerPose: context.settings.playerPose }, metrics,
      snapshotKiBps: p.snapshotBytes / 1024 / (p.durationMs / 1000), debugKiBps: p.debugBytes / 1024 / (p.durationMs / 1000),
      snapshotHz: p.snapshots / (p.durationMs / 1000), frameCount,
      slowFrames: (p.samples.frameMs ?? []).filter((v) => v > 1000 / 60 + 0.5).length,
      baselineId: this.baselineId, startLocation: p.startLocation, endLocation: context.location ?? null,
      frameSamplesMs: p.samples.frameMs?.map((value) => Number(value.toFixed(3))), timeline: p.timeline });
    if (this.runs.length > 50) this.runs.splice(this.runs.findIndex((run) => run.id !== this.baselineId), 1);
    this.pending = null;
    this.status = `Recorded: ${p.label}`;
    this.archiveChanged();
  }
  clear() { this.cancel("Ready"); this.runs = []; this.baselineId = null; this.archiveChanged(); }
}
export const performanceRecorder = new PerformanceRecorder();

// JSON-encode settings inside a quoted CSV cell; preserve commas and newlines.
// Prefix text fields beginning with spreadsheet formula characters.
export function capturesCsv(runs: Capture[]) {
  const quote = (value: unknown) => {
    let s = String(value ?? "");
    if (typeof value === "string" && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return `"${s.replaceAll('"', '""')}"`;
  };
  const header = ["id", "label", "started_at", "is_baseline", "baseline_id", "delta_baseline_ms", "delta_previous_ms", "delta_baseline_percent",
    "duration_ms", "snapshot_KiB_s", "debug_KiB_s", "snapshot_Hz", "frame_count", "frames_over_17.17ms",
    ...METRICS.flatMap((m) => [`${m}_mean`, `${m}_p50`, `${m}_p95`, `${m}_p99`, `${m}_stddev`, `${m}_samples`]), "settings"];
  const rows = runs.map((r, index) => {
    const baseline = runs.find((b) => b.id === r.baselineId);
    const delta = difference(r.metrics.frameMs?.mean, baseline?.metrics.frameMs?.mean);
    const baseMean = baseline?.metrics.frameMs?.mean;
    return [r.id, r.label, r.startedAt, r.baseline, r.baselineId, delta,
      difference(r.metrics.frameMs?.mean, runs[index - 1]?.metrics.frameMs?.mean),
      delta !== null && baseMean ? 100 * delta / baseMean : null,
      r.durationMs, r.snapshotKiBps, r.debugKiBps, r.snapshotHz, r.frameCount, r.slowFrames,
      ...METRICS.flatMap((m) => [r.metrics[m]?.mean, r.metrics[m]?.p50, r.metrics[m]?.p95,
        r.metrics[m]?.p99, r.metrics[m]?.stddev, r.metrics[m]?.count]), JSON.stringify(r.settings)];
  });
  return [header, ...rows].map((row) => row.map(quote).join(",")).join("\r\n");
}
