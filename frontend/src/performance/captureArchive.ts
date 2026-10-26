import type { Capture } from "./measurements";

export const CAPTURE_STORAGE_KEY = "avenlab-performance-captures-v1";
const MAX_SAVED_RUNS = 20;
const MAX_CHARS = 2_000_000;
export type CaptureStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;
type Archive = { schemaVersion: 1; baselineId: number | null; runs: Capture[] };

function isCapture(value: unknown): value is Capture {
  if (!value || typeof value !== "object") return false;
  const r = value as Partial<Capture>;
  return Number.isSafeInteger(r.id) && r.id! > 0 && typeof r.label === "string" && r.label.length <= 120
    && typeof r.startedAt === "string" && typeof r.baseline === "boolean"
    && typeof r.durationMs === "number" && Number.isFinite(r.durationMs) && r.durationMs > 0
    && !!r.settings && typeof r.settings === "object" && !!r.metrics && typeof r.metrics === "object"
    && Object.values(r.metrics).every((m) => m !== undefined && m !== null && typeof m === "object"
      && [m.count, m.mean, m.p50, m.p95, m.p99, m.stddev].every((n) => typeof n === "number" && Number.isFinite(n)))
    && [r.snapshotKiBps, r.debugKiBps, r.snapshotHz, r.slowFrames, r.frameCount].every((n) => typeof n === "number" && Number.isFinite(n));
}

export function loadCaptureArchive(storage: CaptureStorage) {
  const empty = { runs: [] as Capture[], baselineId: null as number | null };
  try {
    const text = storage.getItem(CAPTURE_STORAGE_KEY);
    if (!text) return { ...empty, message: "Captures save in this browser. Export JSON to share." };
    if (text.length > MAX_CHARS) throw new Error("Archive too large");
    const data = JSON.parse(text) as Archive;
    if (data.schemaVersion !== 1 || !Array.isArray(data.runs) || !data.runs.every(isCapture)) throw new Error("Invalid archive");
    const runs = data.runs.slice(-MAX_SAVED_RUNS);
    const baselineId = runs.some((r) => r.id === data.baselineId) ? data.baselineId : null;
    return { runs, baselineId, message: `${runs.length} captures saved in this browser. Export JSON to share.` };
  } catch {
    return { ...empty, message: "Browser history unavailable. Export JSON before reloading." };
  }
}

export function saveCaptureArchive(storage: CaptureStorage, runs: Capture[], baselineId: number | null) {
  try {
    const saved = [...runs];
    const prune = () => saved.splice(Math.max(0, saved.findIndex((r) => r.id !== baselineId)), 1);
    while (saved.length > MAX_SAVED_RUNS) prune();
    const encode = () => JSON.stringify({ schemaVersion: 1, baselineId, runs: saved } satisfies Archive);
    let text = encode();
    while (text.length > MAX_CHARS && saved.length > 1) { prune(); text = encode(); }
    if (text.length > MAX_CHARS) throw new Error("Archive too large");
    if (saved.length) storage.setItem(CAPTURE_STORAGE_KEY, text);
    else storage.removeItem(CAPTURE_STORAGE_KEY);
    return `${saved.length} captures saved in this browser. Export JSON to share.${saved.length < runs.length ? " Older runs remain in this session's export." : ""}`;
  } catch {
    return "Browser save failed. Captures remain in this session; export JSON before reloading.";
  }
}

export function captureFilename(label: string, extension: "json" | "csv", now = new Date()) {
  const slug = label.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 64) || "comparison";
  return `avenlab-performance-${slug}-${now.toISOString().replace(/[:.]/g, "-")}.${extension}`;
}
