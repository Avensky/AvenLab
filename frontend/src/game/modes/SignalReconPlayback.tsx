import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
    type ChangeEvent,
} from "react";
import { GameButton } from "../../components/GameButton";
import { getApiBaseUrl } from "../../store/canBusStore";

type PlaybackDirection = "start" | "end" | "next" | "prev" | "nearest";
type ValidationStatus = "positive" | "negative" | "uncertain";
type PlaybackRole = "constant" | "rolling_counter" | "checksum_candidate";

type PlaybackMeta = {
    ok: boolean;
    session_id: string;
    label?: string | null;
    bus_interface?: string | null;
    bus_mode?: string | null;
    capture_status?: string | null;
    frame_count: number;
    distinct_ids: number;
    first_timestamp_ms: number;
    last_timestamp_ms: number;
    duration_ms: number;
    timestamp_authority: "server" | string;
};

type PlaybackFrame = {
    id: number;
    timestamp_ms: number;
    bucket_ms: number;
    can_id: number;
    can_id_hex: string;
    dlc: number;
    data_hex: string;
    bytes: number[];
    previous_data_hex: string | null;
    previous_bytes: number[] | null;
    delta_positions: number[];
    changed: boolean;
    signal_name?: string | null;
    decoded?: unknown;
    source?: string | null;
};

type PlaybackSlice = {
    bucket_ms: number;
    start_ms: number;
    end_ms: number;
    frame_count: number;
    frames: PlaybackFrame[];
};

type PlaybackResponse = {
    ok: boolean;
    session_id: string;
    capture_status?: string | null;
    timestamp_authority: string;
    tolerance_ms: number;
    direction: PlaybackDirection;
    cursor_ms: number;
    matching_frame_count: number;
    matching_slice_count: number;
    first_bucket_ms: number | null;
    last_bucket_ms: number | null;
    returned_first_bucket_ms: number | null;
    returned_last_bucket_ms: number | null;
    has_before: boolean;
    has_after: boolean;
    slices: PlaybackSlice[];
    detail?: string;
    error?: string;
};

type SavedHypothesis = {
    id: string;
    can_id: number;
    can_id_hex?: string;
    byte_index: number;
    bit_mask?: number | null;
    hypothesis_kind: string;
    confidence: number;
    source: string;
    validation_status: "unreviewed" | ValidationStatus;
    notes?: string | null;
    evidence?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
};

type HypothesesResponse = {
    ok?: boolean;
    hypotheses?: SavedHypothesis[];
    detail?: string;
    error?: string;
};

type SelectedByte = {
    frame: PlaybackFrame;
    byteIndex: number;
};

type SignalReconPlaybackProps = {
    sessionId: string | null;
    disabled?: boolean;
};

const SPEEDS = [0.1, 0.25, 0.5, 1, 2, 5, 10, 25, 50, 100];
const TOLERANCES = [1, 2, 5, 10, 25, 50, 100, 250, 500, 1000];
const PAGE_SLICES = 180;

const ROLE_OPTIONS: Array<{
    kind: PlaybackRole;
    label: string;
    description: string;
}> = [
    {
        kind: "constant",
        label: "CONSTANT",
        description: "The byte remains unchanged during this operating state.",
    },
    {
        kind: "rolling_counter",
        label: "COUNTER / TIMER",
        description: "The byte or nibble advances periodically or modulo a range.",
    },
    {
        kind: "checksum_candidate",
        label: "CHECKSUM",
        description: "The byte behaves like payload integrity data; algorithm is unconfirmed.",
    },
];

function formatTime(milliseconds: number) {
    if (!Number.isFinite(milliseconds)) return "0.000s";
    return `${(milliseconds / 1000).toFixed(3)}s`;
}

function byteHex(value: number | undefined) {
    if (typeof value !== "number") return "--";
    return value.toString(16).toUpperCase().padStart(2, "0");
}

function shortSessionId(sessionId: string | null) {
    if (!sessionId) return "none";
    if (sessionId.length <= 14) return sessionId;
    return `${sessionId.slice(0, 8)}…${sessionId.slice(-4)}`;
}

function getMlAdminToken() {
    const storageKey = "avenlab.mlAdminToken";
    const existing = window.sessionStorage.getItem(storageKey)?.trim();
    if (existing) return existing;

    const entered = window.prompt(
        "Enter the AvenLab ML admin token. It remains only in this browser tab.",
    )?.trim();
    if (!entered) return null;

    window.sessionStorage.setItem(storageKey, entered);
    return entered;
}

function statusTone(status: SavedHypothesis["validation_status"] | undefined) {
    if (status === "positive") return "border-green-300/50 bg-green-500/15 text-green-100";
    if (status === "negative") return "border-red-300/50 bg-red-500/15 text-red-100";
    if (status === "uncertain") return "border-yellow-300/50 bg-yellow-500/15 text-yellow-100";
    return "border-slate-600 bg-slate-900 text-slate-400";
}

function decodedText(value: unknown) {
    if (value === null || value === undefined || value === "") return "—";
    if (typeof value === "string") return value;
    try {
        return JSON.stringify(value);
    } catch {
        return String(value);
    }
}

export function SignalReconPlayback({
    sessionId,
    disabled = false,
}: SignalReconPlaybackProps) {
    const [meta, setMeta] = useState<PlaybackMeta | null>(null);
    const [slices, setSlices] = useState<PlaybackSlice[]>([]);
    const [sliceIndex, setSliceIndex] = useState(0);
    const [hasBefore, setHasBefore] = useState(false);
    const [hasAfter, setHasAfter] = useState(false);
    const [matchingFrameCount, setMatchingFrameCount] = useState(0);
    const [matchingSliceCount, setMatchingSliceCount] = useState(0);
    const [firstBucketMs, setFirstBucketMs] = useState<number | null>(null);
    const [lastBucketMs, setLastBucketMs] = useState<number | null>(null);

    const [playing, setPlaying] = useState(false);
    const [loop, setLoop] = useState(false);
    const [speed, setSpeed] = useState(1);
    const [toleranceMs, setToleranceMs] = useState(1);

    const [idFilter, setIdFilter] = useState("");
    const [search, setSearch] = useState("");
    const [byteIndex, setByteIndex] = useState("");
    const [byteValue, setByteValue] = useState("");
    const [deltasOnly, setDeltasOnly] = useState(false);
    const [byteChangedOnly, setByteChangedOnly] = useState(false);

    const [hypotheses, setHypotheses] = useState<SavedHypothesis[]>([]);
    const [selectedByte, setSelectedByte] = useState<SelectedByte | null>(null);
    const [loading, setLoading] = useState(false);
    const [savingRole, setSavingRole] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const requestSequence = useRef(0);
    const currentSlice = slices[sliceIndex] ?? null;

    const queryString = useMemo(() => {
        const params = new URLSearchParams();
        params.set("tolerance_ms", String(toleranceMs));
        params.set("slice_limit", String(PAGE_SLICES));
        if (idFilter.trim()) params.set("id_filter", idFilter.trim());
        if (search.trim()) params.set("search", search.trim());
        if (byteIndex !== "") params.set("byte_index", byteIndex);
        if (byteValue.trim()) params.set("byte_value", byteValue.trim());
        if (deltasOnly) params.set("deltas_only", "true");
        if (byteChangedOnly) params.set("byte_changed_only", "true");
        return params;
    }, [byteChangedOnly, byteIndex, byteValue, deltasOnly, idFilter, search, toleranceMs]);

    const loadHypotheses = useCallback(async () => {
        if (!sessionId) {
            setHypotheses([]);
            return;
        }
        try {
            const response = await fetch(
                `${getApiBaseUrl()}/data/session/${sessionId}/hypotheses`,
            );
            const data = (await response.json().catch(() => ({}))) as HypothesesResponse;
            if (!response.ok || data.ok === false) {
                throw new Error(
                    data.detail ?? data.error ?? `Hypothesis load failed with HTTP ${response.status}.`,
                );
            }
            setHypotheses(Array.isArray(data.hypotheses) ? data.hypotheses : []);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to load byte hypotheses.");
        }
    }, [sessionId]);

    const loadMeta = useCallback(async () => {
        if (!sessionId) {
            setMeta(null);
            return;
        }
        const response = await fetch(
            `${getApiBaseUrl()}/data/can/session/${sessionId}/playback/meta`,
        );
        const data = (await response.json().catch(() => ({}))) as PlaybackMeta & {
            detail?: string;
            error?: string;
        };
        if (!response.ok || data.ok === false) {
            throw new Error(
                data.detail ?? data.error ?? `Playback metadata failed with HTTP ${response.status}.`,
            );
        }
        setMeta(data);
    }, [sessionId]);

    const loadPage = useCallback(async (
        direction: PlaybackDirection,
        cursorMs?: number,
    ) => {
        if (!sessionId || disabled) return;

        const sequence = ++requestSequence.current;
        setLoading(true);
        setError(null);

        try {
            const params = new URLSearchParams(queryString);
            params.set("direction", direction);
            if (typeof cursorMs === "number" && Number.isFinite(cursorMs)) {
                params.set("cursor_ms", String(Math.max(0, Math.round(cursorMs))));
            }

            const response = await fetch(
                `${getApiBaseUrl()}/data/can/session/${sessionId}/playback?${params.toString()}`,
            );
            const data = (await response.json().catch(() => ({}))) as PlaybackResponse;
            if (!response.ok || data.ok === false) {
                throw new Error(
                    data.detail ?? data.error ?? `Playback request failed with HTTP ${response.status}.`,
                );
            }
            if (sequence !== requestSequence.current) return;

            setSlices(data.slices ?? []);
            setSliceIndex(direction === "prev" || direction === "end"
                ? Math.max((data.slices?.length ?? 1) - 1, 0)
                : 0);
            setHasBefore(Boolean(data.has_before));
            setHasAfter(Boolean(data.has_after));
            setMatchingFrameCount(data.matching_frame_count ?? 0);
            setMatchingSliceCount(data.matching_slice_count ?? 0);
            setFirstBucketMs(data.first_bucket_ms);
            setLastBucketMs(data.last_bucket_ms);
            setSelectedByte(null);
        } catch (err) {
            if (sequence !== requestSequence.current) return;
            setError(err instanceof Error ? err.message : "Playback request failed.");
            setSlices([]);
            setSliceIndex(0);
        } finally {
            if (sequence === requestSequence.current) setLoading(false);
        }
    }, [disabled, queryString, sessionId]);

    useEffect(() => {
        const timer = window.setTimeout(() => {
            setPlaying(false);
            setSlices([]);
            setSliceIndex(0);
            setSelectedByte(null);
            setError(null);
            if (!sessionId) {
                setMeta(null);
                setHypotheses([]);
                return;
            }
            void Promise.all([loadMeta(), loadHypotheses()]).catch((err: unknown) => {
                setError(err instanceof Error ? err.message : "Playback initialization failed.");
            });
        }, 0);
        return () => window.clearTimeout(timer);
    }, [loadHypotheses, loadMeta, sessionId]);

    useEffect(() => {
        if (!sessionId || disabled) return;
        const timer = window.setTimeout(() => {
            const cursor = currentSlice?.bucket_ms ?? meta?.first_timestamp_ms;
            void loadPage(cursor === undefined ? "start" : "nearest", cursor);
        }, 300);
        return () => window.clearTimeout(timer);
        // currentSlice is intentionally excluded: filters should reload around
        // the current time, not reload on every playback step.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [queryString, sessionId, disabled]);

    const goToStart = useCallback(async () => {
        setPlaying(false);
        await loadPage("start");
    }, [loadPage]);

    const goToEnd = useCallback(async () => {
        setPlaying(false);
        await loadPage("end");
    }, [loadPage]);

    const stepForward = useCallback(async () => {
        if (!currentSlice) {
            await loadPage("start");
            return;
        }
        if (sliceIndex + 1 < slices.length) {
            setSliceIndex((index) => index + 1);
            setSelectedByte(null);
            return;
        }
        if (hasAfter) {
            await loadPage("next", currentSlice.bucket_ms);
            return;
        }
        if (loop) {
            await loadPage("start");
            return;
        }
        setPlaying(false);
    }, [currentSlice, hasAfter, loadPage, loop, sliceIndex, slices.length]);

    const stepBackward = useCallback(async () => {
        if (!currentSlice) {
            await loadPage("end");
            return;
        }
        if (sliceIndex > 0) {
            setSliceIndex((index) => Math.max(0, index - 1));
            setSelectedByte(null);
            return;
        }
        if (hasBefore) {
            await loadPage("prev", currentSlice.bucket_ms);
        }
    }, [currentSlice, hasBefore, loadPage, sliceIndex]);

    useEffect(() => {
        if (!playing || loading || disabled || !currentSlice) return;

        const nextSlice = slices[sliceIndex + 1];
        const rawDelay = nextSlice
            ? (nextSlice.bucket_ms - currentSlice.bucket_ms) / Math.max(speed, 0.01)
            : 20;
        const delay = Math.max(10, Math.min(2000, rawDelay));
        const timer = window.setTimeout(() => {
            void stepForward();
        }, delay);
        return () => window.clearTimeout(timer);
    }, [currentSlice, disabled, loading, playing, sliceIndex, slices, speed, stepForward]);

    const progressStart = meta?.first_timestamp_ms ?? firstBucketMs ?? 0;
    const progressEnd = meta?.last_timestamp_ms ?? lastBucketMs ?? progressStart;
    const progressValue = currentSlice?.bucket_ms ?? progressStart;
    const progressPercent = progressEnd > progressStart
        ? ((progressValue - progressStart) / (progressEnd - progressStart)) * 100
        : 0;

    const seek = async (value: number) => {
        setPlaying(false);
        await loadPage("nearest", value);
    };

    const clearFilters = () => {
        setIdFilter("");
        setSearch("");
        setByteIndex("");
        setByteValue("");
        setDeltasOnly(false);
        setByteChangedOnly(false);
    };

    const hypothesisFor = useCallback((
        canId: number,
        targetByteIndex: number,
        kind: PlaybackRole,
    ) => {
        const matches = hypotheses.filter(
            (item) => item.can_id === canId
                && item.byte_index === targetByteIndex
                && item.hypothesis_kind === kind,
        );
        return matches.find((item) => item.source === "human") ?? matches[0] ?? null;
    }, [hypotheses]);

    const validateRole = async (
        role: PlaybackRole,
        validationStatus: ValidationStatus,
    ) => {
        if (!sessionId || !selectedByte) return;
        const token = getMlAdminToken();
        if (!token) {
            setError("ML admin token is required to validate byte roles.");
            return;
        }

        const key = `${selectedByte.frame.can_id}:${selectedByte.byteIndex}:${role}`;
        setSavingRole(key);
        setError(null);

        const existing = hypothesisFor(
            selectedByte.frame.can_id,
            selectedByte.byteIndex,
            role,
        );

        try {
            const response = await fetch(
                `${getApiBaseUrl()}/data/can/session/${sessionId}/hypotheses`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "X-AvenLab-ML-Token": token,
                    },
                    body: JSON.stringify({
                        can_id: selectedByte.frame.can_id,
                        byte_index: selectedByte.byteIndex,
                        bit_mask: existing?.bit_mask ?? null,
                        hypothesis_kind: role,
                        action_group: "baseline_playback_review",
                        validation_status: validationStatus,
                        confidence: existing?.confidence ?? 0.75,
                        notes: existing?.notes
                            ?? `Playback review of ${selectedByte.frame.can_id_hex} B${selectedByte.byteIndex}.`,
                        evidence: {
                            ...(existing?.evidence ?? {}),
                            playback_frame_id: selectedByte.frame.id,
                            playback_timestamp_ms: selectedByte.frame.timestamp_ms,
                            observed_value: selectedByte.frame.bytes[selectedByte.byteIndex],
                            previous_value: selectedByte.frame.previous_bytes?.[selectedByte.byteIndex] ?? null,
                            changed_in_frame: selectedByte.frame.delta_positions.includes(selectedByte.byteIndex),
                            timestamp_authority: "server",
                        },
                        metadata: {
                            ...(existing?.metadata ?? {}),
                            source: "signal-recon-playback",
                            manual_override: true,
                        },
                    }),
                },
            );
            const data = await response.json().catch(() => ({}));
            if (!response.ok || data.ok === false) {
                if (response.status === 403) {
                    window.sessionStorage.removeItem("avenlab.mlAdminToken");
                }
                throw new Error(
                    data.detail ?? data.error ?? `Byte-role save failed with HTTP ${response.status}.`,
                );
            }
            await loadHypotheses();
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to validate byte role.");
        } finally {
            setSavingRole(null);
        }
    };

    if (!sessionId) {
        return (
            <div className="grid h-full place-items-center p-5 font-mono">
                <div className="rounded-xl border border-yellow-300/30 bg-yellow-500/10 p-5 text-yellow-100">
                    Select a finalized session before opening playback.
                </div>
            </div>
        );
    }

    return (
        <div className="flex h-full min-h-0 flex-col overflow-hidden bg-[#020617] p-2 font-mono text-green-100 sm:p-3">
            <div className="shrink-0 space-y-2 rounded-xl border border-green-400/20 bg-black/60 p-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                        <p className="text-[10px] tracking-[0.28em] text-yellow-300">
                            DATABASE PLAYBACK // SERVER TIMESTAMPS
                        </p>
                        <p className="text-xs text-slate-400">
                            {shortSessionId(sessionId)} · {meta?.frame_count.toLocaleString() ?? 0} frames · {meta?.distinct_ids ?? 0} IDs · {meta?.capture_status ?? "loading"}
                        </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-1">
                        <GameButton onPress={() => void goToStart()} disabled={loading || disabled} className="rounded border border-slate-500 bg-slate-900 px-2 py-1 text-sm disabled:opacity-40" title="Go to start">|◀</GameButton>
                        <GameButton onPress={() => void stepBackward()} disabled={loading || disabled || (!hasBefore && sliceIndex <= 0)} className="rounded border border-slate-500 bg-slate-900 px-2 py-1 text-sm disabled:opacity-40" title="Previous time slice">◀</GameButton>
                        <GameButton onPress={() => setPlaying(true)} disabled={loading || disabled || playing || !currentSlice} className="rounded border border-green-300/40 bg-green-500/10 px-3 py-1 text-sm disabled:opacity-40" title="Play">▶</GameButton>
                        <GameButton onPress={() => setPlaying(false)} disabled={!playing} className="rounded border border-red-300/40 bg-red-500/10 px-3 py-1 text-sm disabled:opacity-40" title="Stop">■</GameButton>
                        <GameButton onPress={() => void stepForward()} disabled={loading || disabled || (!hasAfter && sliceIndex + 1 >= slices.length)} className="rounded border border-slate-500 bg-slate-900 px-2 py-1 text-sm disabled:opacity-40" title="Next time slice">▶</GameButton>
                        <GameButton onPress={() => void goToEnd()} disabled={loading || disabled} className="rounded border border-slate-500 bg-slate-900 px-2 py-1 text-sm disabled:opacity-40" title="Go to end">▶|</GameButton>
                        <GameButton onPress={() => setLoop((value) => !value)} disabled={disabled} className={`rounded border px-2 py-1 text-sm ${loop ? "border-cyan-300 bg-cyan-500/20 text-cyan-100" : "border-slate-600 bg-slate-900 text-slate-400"}`} title="Repeat continuously">↻</GameButton>

                        <select value={speed} onChange={(event: ChangeEvent<HTMLSelectElement>) => setSpeed(Number(event.target.value))} className="rounded border border-slate-600 bg-slate-950 px-2 py-1 text-xs text-green-100">
                            {SPEEDS.map((value) => <option key={value} value={value}>{value}x</option>)}
                        </select>
                        <select value={toleranceMs} onChange={(event: ChangeEvent<HTMLSelectElement>) => setToleranceMs(Number(event.target.value))} className="rounded border border-slate-600 bg-slate-950 px-2 py-1 text-xs text-green-100" title="Frames within this server-time bucket are one playback slice">
                            {TOLERANCES.map((value) => <option key={value} value={value}>{value} ms</option>)}
                        </select>
                    </div>
                </div>

                <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                    <div>
                        <input
                            type="range"
                            min={progressStart}
                            max={Math.max(progressEnd, progressStart + 1)}
                            value={Math.min(Math.max(progressValue, progressStart), Math.max(progressEnd, progressStart + 1))}
                            onChange={(event: ChangeEvent<HTMLInputElement>) => void seek(Number(event.target.value))}
                            disabled={loading || disabled || !meta?.frame_count}
                            className="w-full accent-green-400"
                            aria-label="Playback position"
                        />
                        <div className="flex justify-between text-[10px] text-slate-500">
                            <span>{formatTime(progressStart)}</span>
                            <span className="text-green-200">{formatTime(progressValue)} · {progressPercent.toFixed(1)}%</span>
                            <span>{formatTime(progressEnd)}</span>
                        </div>
                    </div>
                    <div className="self-center text-right text-[10px] text-slate-500">
                        <p>{matchingFrameCount.toLocaleString()} filtered frames</p>
                        <p>{matchingSliceCount.toLocaleString()} slices at {toleranceMs} ms</p>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-1 sm:grid-cols-6">
                    <input value={idFilter} onChange={(event: ChangeEvent<HTMLInputElement>) => setIdFilter(event.target.value)} placeholder="ID: 0x123 or 291" className="rounded border border-slate-600 bg-slate-950 px-2 py-1 text-xs text-green-100 placeholder:text-slate-600" />
                    <input value={search} onChange={(event: ChangeEvent<HTMLInputElement>) => setSearch(event.target.value)} placeholder="Search ID, hex, digit" className="rounded border border-slate-600 bg-slate-950 px-2 py-1 text-xs text-green-100 placeholder:text-slate-600" />
                    <select value={byteIndex} onChange={(event: ChangeEvent<HTMLSelectElement>) => setByteIndex(event.target.value)} className="rounded border border-slate-600 bg-slate-950 px-2 py-1 text-xs text-green-100">
                        <option value="">Any byte</option>
                        {Array.from({ length: 8 }, (_, index) => <option key={index} value={index}>Byte B{index}</option>)}
                    </select>
                    <input value={byteValue} onChange={(event: ChangeEvent<HTMLInputElement>) => setByteValue(event.target.value)} placeholder="Byte value: 47 / 2F" className="rounded border border-slate-600 bg-slate-950 px-2 py-1 text-xs text-green-100 placeholder:text-slate-600" />
                    <label className="flex items-center gap-2 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-[10px] text-slate-300">
                        <input type="checkbox" checked={deltasOnly} onChange={(event: ChangeEvent<HTMLInputElement>) => setDeltasOnly(event.target.checked)} /> DELTAS ONLY
                    </label>
                    <div className="flex gap-1">
                        <label className="flex flex-1 items-center gap-1 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-[10px] text-slate-300">
                            <input type="checkbox" checked={byteChangedOnly} onChange={(event: ChangeEvent<HTMLInputElement>) => setByteChangedOnly(event.target.checked)} disabled={byteIndex === ""} /> BYTE CHANGED
                        </label>
                        <GameButton onPress={clearFilters} className="rounded border border-red-300/30 bg-red-500/10 px-2 text-[10px] text-red-100">CLEAR</GameButton>
                    </div>
                </div>
            </div>

            {error && (
                <div className="mt-2 shrink-0 rounded-lg border border-red-300/40 bg-red-500/10 p-2 text-xs text-red-100">
                    {error}
                </div>
            )}

            <div className="mt-2 grid min-h-0 flex-1 gap-2 lg:grid-cols-[minmax(0,1fr)_320px]">
                <div className="min-h-0 overflow-auto rounded-xl border border-green-400/20 bg-black/50">
                    <table className="w-full min-w-[860px] border-collapse text-left text-xs">
                        <thead className="sticky top-0 z-10 bg-emerald-950/95 text-green-100">
                            <tr>
                                <th className="border-b border-r border-green-300/30 px-2 py-2">Time</th>
                                <th className="border-b border-r border-green-300/30 px-2 py-2">Hex ID</th>
                                <th className="border-b border-r border-green-300/30 px-2 py-2">Ln</th>
                                <th className="border-b border-r border-green-300/30 px-2 py-2">Data · click a byte</th>
                                <th className="border-b border-r border-green-300/30 px-2 py-2">Label</th>
                                <th className="border-b border-green-300/30 px-2 py-2">Decoded</th>
                            </tr>
                        </thead>
                        <tbody>
                            {(currentSlice?.frames ?? []).map((frame) => (
                                <tr key={frame.id} className="border-b border-slate-800 hover:bg-green-500/5">
                                    <td className="border-r border-slate-800 px-2 py-2 text-cyan-300">{formatTime(frame.timestamp_ms)}</td>
                                    <td className="border-r border-slate-800 px-2 py-2 font-black text-cyan-300">{frame.can_id_hex}</td>
                                    <td className="border-r border-slate-800 px-2 py-2 text-slate-400">{frame.dlc}</td>
                                    <td className="border-r border-slate-800 px-2 py-2">
                                        <div className="flex flex-wrap gap-1">
                                            {frame.bytes.map((value, index) => {
                                                const changed = frame.delta_positions.includes(index);
                                                const selected = selectedByte?.frame.id === frame.id && selectedByte.byteIndex === index;
                                                return (
                                                    <button
                                                        key={index}
                                                        type="button"
                                                        onClick={() => setSelectedByte({ frame, byteIndex: index })}
                                                        className={`rounded border px-1.5 py-1 font-black ${selected
                                                            ? "border-yellow-200 bg-yellow-500/20 text-yellow-100"
                                                            : changed
                                                                ? "border-cyan-300/70 bg-cyan-500/20 text-cyan-100"
                                                                : "border-slate-700 bg-slate-900 text-slate-400"
                                                        }`}
                                                        title={`B${index}: hex ${byteHex(value)}, decimal ${value}${changed ? ", changed from previous frame" : ""}`}
                                                    >
                                                        <span className="mr-1 text-[8px] text-slate-600">B{index}</span>{byteHex(value)}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </td>
                                    <td className="max-w-[220px] truncate border-r border-slate-800 px-2 py-2 text-cyan-300">{frame.signal_name ?? "—"}</td>
                                    <td className="max-w-[360px] truncate px-2 py-2 text-slate-400">{decodedText(frame.decoded)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>

                    {!loading && !currentSlice && (
                        <div className="grid min-h-48 place-items-center p-6 text-sm text-slate-500">
                            No frames match the active filters.
                        </div>
                    )}
                    {loading && (
                        <div className="grid min-h-48 place-items-center p-6 text-sm text-green-200">
                            Loading server-timestamped playback slices…
                        </div>
                    )}
                </div>

                <aside className="min-h-0 overflow-y-auto rounded-xl border border-cyan-300/20 bg-slate-950/90 p-3">
                    <p className="text-[10px] tracking-[0.25em] text-cyan-300">BYTE ROLE REVIEW</p>
                    {!selectedByte ? (
                        <div className="mt-3 rounded-lg border border-slate-700 bg-slate-900/70 p-4 text-xs text-slate-500">
                            Click a byte in the frame table. Changed bytes are cyan. You can then confirm, reject, or mark uncertain for constant, counter/timer, and checksum roles.
                        </div>
                    ) : (
                        <div className="mt-3 space-y-3">
                            <div className="rounded-lg border border-green-300/30 bg-green-500/10 p-3">
                                <p className="font-black text-green-100">
                                    {selectedByte.frame.can_id_hex} / B{selectedByte.byteIndex}
                                </p>
                                <div className="mt-2 grid grid-cols-2 gap-2 text-[10px] text-slate-400">
                                    <p>current: <span className="text-cyan-200">0x{byteHex(selectedByte.frame.bytes[selectedByte.byteIndex])} / {selectedByte.frame.bytes[selectedByte.byteIndex]}</span></p>
                                    <p>previous: <span className="text-slate-200">{selectedByte.frame.previous_bytes ? `0x${byteHex(selectedByte.frame.previous_bytes[selectedByte.byteIndex])} / ${selectedByte.frame.previous_bytes[selectedByte.byteIndex]}` : "none"}</span></p>
                                    <p>changed: <span className={selectedByte.frame.delta_positions.includes(selectedByte.byteIndex) ? "text-cyan-200" : "text-slate-500"}>{selectedByte.frame.delta_positions.includes(selectedByte.byteIndex) ? "YES" : "NO"}</span></p>
                                    <p>server time: <span className="text-slate-200">{formatTime(selectedByte.frame.timestamp_ms)}</span></p>
                                </div>
                            </div>

                            {ROLE_OPTIONS.map((role) => {
                                const saved = hypothesisFor(
                                    selectedByte.frame.can_id,
                                    selectedByte.byteIndex,
                                    role.kind,
                                );
                                const saving = savingRole === `${selectedByte.frame.can_id}:${selectedByte.byteIndex}:${role.kind}`;
                                return (
                                    <div key={role.kind} className="rounded-lg border border-slate-700 bg-slate-900/70 p-3">
                                        <div className="flex items-start justify-between gap-2">
                                            <div>
                                                <p className="font-black text-green-100">{role.label}?</p>
                                                <p className="mt-1 text-[10px] leading-relaxed text-slate-500">{role.description}</p>
                                            </div>
                                            <span className={`rounded border px-1.5 py-0.5 text-[9px] font-black ${statusTone(saved?.validation_status)}`}>
                                                {saved?.validation_status?.toUpperCase() ?? "UNREVIEWED"}
                                            </span>
                                        </div>
                                        {saved?.notes && (
                                            <p className="mt-2 text-[10px] text-cyan-100/70">auto: {saved.notes}</p>
                                        )}
                                        <div className="mt-2 grid grid-cols-3 gap-1">
                                            <GameButton onPress={() => void validateRole(role.kind, "positive")} disabled={saving} className="rounded border border-green-300/40 bg-green-500/10 px-2 py-1 text-[10px] text-green-100 disabled:opacity-40">CONFIRM</GameButton>
                                            <GameButton onPress={() => void validateRole(role.kind, "negative")} disabled={saving} className="rounded border border-red-300/40 bg-red-500/10 px-2 py-1 text-[10px] text-red-100 disabled:opacity-40">REJECT</GameButton>
                                            <GameButton onPress={() => void validateRole(role.kind, "uncertain")} disabled={saving} className="rounded border border-yellow-300/40 bg-yellow-500/10 px-2 py-1 text-[10px] text-yellow-100 disabled:opacity-40">UNSURE</GameButton>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </aside>
            </div>
        </div>
    );
}
