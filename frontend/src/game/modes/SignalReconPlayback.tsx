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

type PlaybackMarker = {
    id: string;
    timestamp_ms: number;
    marker_type: string;
    label?: string | null;
    step_code?: string | null;
    mission_code?: string | null;
    metadata?: Record<string, unknown>;
};

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
    marker_count?: number;
    markers?: PlaybackMarker[];
    observed_ids?: number[];
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
    observed_in_slice?: boolean;
    state_carried?: boolean;
    state_available?: boolean;
    state_age_ms?: number | null;
};

type PlaybackSlice = {
    bucket_ms: number;
    start_ms: number;
    end_ms: number;
    frame_count: number;
    frames: PlaybackFrame[];
    state_frames?: PlaybackFrame[];
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
const BYTE_CELL_CLASS =
    "inline-flex h-5 w-full min-w-0 items-center justify-center rounded-sm border px-0 text-[9px] font-black leading-none sm:text-[10px]";

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

function canIdHex(value: number) {
    const width = value <= 0x7ff ? 3 : 8;
    return `0x${value.toString(16).toUpperCase().padStart(width, "0")}`;
}

// function shortSessionId(sessionId: string | null) {
//     if (!sessionId) return "none";
//     if (sessionId.length <= 14) return sessionId;
//     return `${sessionId.slice(0, 8)}…${sessionId.slice(-4)}`;
// }

function statusTone(status: SavedHypothesis["validation_status"] | undefined) {
    if (status === "positive") return "border-green-300/50 bg-green-500/15 text-green-100";
    if (status === "negative") return "border-red-300/50 bg-red-500/15 text-red-100";
    if (status === "uncertain") return "border-yellow-300/50 bg-yellow-500/15 text-yellow-100";
    return "border-slate-600 bg-slate-900 text-slate-400";
}

function markerTone(markerType: string) {
    const normalized = markerType.trim().toLowerCase().replace(/-/g, "_");
    if (["action_start", "action", "target_action", "target_event"].includes(normalized)) {
        return "border-yellow-200 bg-yellow-400 text-slate-950";
    }
    if (normalized.includes("baseline")) {
        return "border-cyan-200 bg-cyan-400 text-slate-950";
    }
    if (normalized.includes("countdown")) {
        return "border-slate-300 bg-slate-400 text-slate-950";
    }
    if (normalized.includes("capture")) {
        return "border-green-200 bg-green-400 text-slate-950";
    }
    if (normalized.includes("complete")) {
        return "border-purple-200 bg-purple-400 text-slate-950";
    }
    if (normalized.includes("cancel")) {
        return "border-red-200 bg-red-400 text-slate-950";
    }
    return "border-slate-300 bg-slate-500 text-white";
}

function markerTitle(marker: PlaybackMarker) {
    return [
        marker.step_code,
        marker.label,
        marker.marker_type,
    ].find((value) => typeof value === "string" && value.trim()) ?? "MARKER";
}

function markerPercent(
    marker: PlaybackMarker,
    startMs: number,
    endMs: number,
) {
    if (endMs <= startMs) return 0;
    return Math.min(
        100,
        Math.max(0, ((marker.timestamp_ms - startMs) / (endMs - startMs)) * 100),
    );
}

function bitString(value: number | undefined) {
    if (typeof value !== "number") return "--------";
    return value.toString(2).padStart(8, "0");
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
    const [lastBucketMs, setLastBucketMs] = useState<number | null>(null);

    const [playing, setPlaying] = useState(false);
    const [loop, setLoop] = useState(false);
    const [speed, setSpeed] = useState(1);
    const [toleranceMs, setToleranceMs] = useState(1);

    const [selectedCanIds, setSelectedCanIds] = useState<number[]>([]);
    const [idFilterSearch, setIdFilterSearch] = useState("");
    const [idMenuOpen, setIdMenuOpen] = useState(false);
    const [search, setSearch] = useState("");
    const [byteIndex, setByteIndex] = useState("");
    const [byteValue, setByteValue] = useState("");
    const [deltasOnly, setDeltasOnly] = useState(false);
    const [byteChangedOnly, setByteChangedOnly] = useState(false);

    const [hypotheses, setHypotheses] = useState<SavedHypothesis[]>([]);
    const [selectedByte, setSelectedByte] = useState<SelectedByte | null>(null);
    const [loading, setLoading] = useState(false);
    const [savingRole, setSavingRole] = useState<string | null>(null);
    const [roleFeedback, setRoleFeedback] = useState<Record<
        string,
        { validationStatus: ValidationStatus; state: "saving" | "saved" | "error" }
    >>({});
    const [activeMarkerId, setActiveMarkerId] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const requestSequence = useRef(0);
    const idMenuRef = useRef<HTMLDivElement | null>(null);
    const currentSlice = slices[sliceIndex] ?? null;
    const markers = useMemo(
        () => [...(meta?.markers ?? [])].sort(
            (left, right) => left.timestamp_ms - right.timestamp_ms,
        ),
        [meta?.markers],
    );
    const activeMarker = markers.find((marker) => marker.id === activeMarkerId) ?? null;
    const activeMarkerIndex = activeMarker
        ? markers.findIndex((marker) => marker.id === activeMarker.id)
        : -1;
    const observedCanIds = useMemo(() => {
        const fromMeta = meta?.observed_ids ?? [];
        if (fromMeta.length) return [...fromMeta].sort((a, b) => a - b);

        return Array.from(
            new Set(
                slices.flatMap((slice) =>
                    slice.frames.map((frame) => frame.can_id),
                ),
            ),
        ).sort((a, b) => a - b);
    }, [meta?.observed_ids, slices]);
    const visibleCanIdOptions = useMemo(() => {
        const query = idFilterSearch.trim().toLowerCase();
        if (!query) return observedCanIds;

        return observedCanIds.filter((canId) =>
            canIdHex(canId).toLowerCase().includes(query)
            || String(canId).includes(query),
        );
    }, [idFilterSearch, observedCanIds]);

    // Pinned-state mode is intentionally limited to an ID-only filter.
    // Delta/value searches keep their original event-row semantics.
    const persistentSelectionActive =
        selectedCanIds.length > 0
        && !search.trim()
        && byteIndex === ""
        && !byteValue.trim()
        && !deltasOnly
        && !byteChangedOnly;

    const displayFrames = useMemo(() => {
        if (!currentSlice) return [];
        if (persistentSelectionActive && currentSlice.state_frames?.length) {
            return currentSlice.state_frames;
        }
        return currentSlice.frames;
    }, [currentSlice, persistentSelectionActive]);

    useEffect(() => {
        if (!idMenuOpen) return;

        const closeOnOutsidePointer = (event: PointerEvent) => {
            const target = event.target;
            if (
                target instanceof Node
                && !idMenuRef.current?.contains(target)
            ) {
                setIdMenuOpen(false);
            }
        };

        const closeOnEscape = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                setIdMenuOpen(false);
            }
        };

        document.addEventListener("pointerdown", closeOnOutsidePointer);
        document.addEventListener("keydown", closeOnEscape);

        return () => {
            document.removeEventListener("pointerdown", closeOnOutsidePointer);
            document.removeEventListener("keydown", closeOnEscape);
        };
    }, [idMenuOpen]);

    const queryString = useMemo(() => {
        const params = new URLSearchParams();
        params.set("tolerance_ms", String(toleranceMs));
        params.set("slice_limit", String(PAGE_SLICES));
        if (selectedCanIds.length) {
            params.set("id_filter", selectedCanIds.join(","));
        }
        if (persistentSelectionActive) {
            params.set("carry_selected", "true");
        }
        if (search.trim()) params.set("search", search.trim());
        if (byteIndex !== "") params.set("byte_index", byteIndex);
        if (byteValue.trim()) params.set("byte_value", byteValue.trim());
        if (deltasOnly) params.set("deltas_only", "true");
        if (byteChangedOnly) params.set("byte_changed_only", "true");
        return params;
    }, [
        byteChangedOnly,
        byteIndex,
        byteValue,
        deltasOnly,
        persistentSelectionActive,
        search,
        selectedCanIds,
        toleranceMs,
    ]);

    const loadHypotheses = useCallback(async () => {
        if (!sessionId) {
            setHypotheses([]);
            return;
        }
        try {
            const response = await fetch(
                `${getApiBaseUrl()}/data/can/session/${sessionId}/hypotheses`,
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
            setRoleFeedback({});
            setActiveMarkerId(null);
            setSelectedCanIds([]);
            setIdFilterSearch("");
            setIdMenuOpen(false);
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

    const stopPlayback = useCallback(async () => {
        setPlaying(false);
        setActiveMarkerId(null);
        setSelectedByte(null);
        await loadPage("start");
    }, [loadPage]);

    const toggleCanId = (canId: number) => {
        setPlaying(false);
        setSelectedCanIds((current) =>
            current.includes(canId)
                ? current.filter((value) => value !== canId)
                : [...current, canId].sort((a, b) => a - b),
        );
    };

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

    // Frame capture can begin after the session/marker clock starts. Anchoring
    // the range at the first frame compresses every early marker toward the
    // left edge. Keep frames, markers, and the seek control in the same
    // server-issued session-elapsed domain instead.
    const progressStart = 0;
    const progressEnd = Math.max(
        meta?.duration_ms ?? 0,
        meta?.last_timestamp_ms ?? 0,
        lastBucketMs ?? 0,
        markers[markers.length - 1]?.timestamp_ms ?? 0,
        1,
    );
    const progressValue = currentSlice?.bucket_ms ?? progressStart;
    const progressPercent = progressEnd > progressStart
        ? Math.min(
            100,
            Math.max(
                0,
                ((progressValue - progressStart) / (progressEnd - progressStart)) * 100,
            ),
        )
        : 0;
    const markerOffsetMs = activeMarker && currentSlice
        ? currentSlice.bucket_ms - activeMarker.timestamp_ms
        : null;
    const currentChangedFrames = currentSlice?.frames.filter((frame) => frame.changed).length ?? 0;
    const currentChangedBytes = currentSlice?.frames.reduce(
        (total, frame) => total + frame.delta_positions.length,
        0,
    ) ?? 0;
    const coldStateCount = displayFrames.filter(
        (frame) => frame.state_carried || frame.state_available === false,
    ).length;

    const seek = async (value: number) => {
        setPlaying(false);
        await loadPage("nearest", value);
    };

    const seekToMarker = async (marker: PlaybackMarker) => {
        setActiveMarkerId(marker.id);
        setSelectedByte(null);
        await seek(marker.timestamp_ms);
    };

    const stepMarker = async (direction: -1 | 1) => {
        if (!markers.length) return;
        const nextIndex = activeMarkerIndex < 0
            ? (direction > 0 ? 0 : markers.length - 1)
            : Math.min(
                markers.length - 1,
                Math.max(0, activeMarkerIndex + direction),
            );
        await seekToMarker(markers[nextIndex]);
    };

    const clearFilters = () => {
        setSelectedCanIds([]);
        setIdFilterSearch("");
        setIdMenuOpen(false);
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

        const key = `${selectedByte.frame.can_id}:${selectedByte.byteIndex}:${role}`;
        setSavingRole(key);
        setRoleFeedback((current) => ({
            ...current,
            [key]: { validationStatus, state: "saving" },
        }));
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
                throw new Error(
                    data.detail ?? data.error ?? `Byte-role save failed with HTTP ${response.status}.`,
                );
            }
            setRoleFeedback((current) => ({
                ...current,
                [key]: { validationStatus, state: "saved" },
            }));
            await loadHypotheses();
        } catch (err) {
            setRoleFeedback((current) => ({
                ...current,
                [key]: { validationStatus, state: "error" },
            }));
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
        <div className="flex h-full min-h-0 flex-col  overflow-hidden bg-[#020617] font-mono text-green-100">
            <div className="shrink-0 border border-green-400/20 bg-black/60">
                <div className="px-2 w-full grid grid-cols-1 sm:grid-cols-2">
                    <div>
                        {/* <p className="text-[10px] tracking-[0.28em] text-yellow-300">
                            DATABASE PLAYBACK // SERVER TIMESTAMPS
                        </p> */}
                        <p className="text-xs text-slate-400">
                            {matchingFrameCount ?? 0}frames · {meta?.distinct_ids ?? 0} IDs · {matchingSliceCount.toLocaleString()} slices @{toleranceMs}ms · {markers.length} markers
                        </p>
                    </div>
                    <div className="flex flex-wrap items-center justify-start sm:justify-end gap-1">
                        <GameButton onPress={() => void goToStart()} disabled={loading || disabled} className="rounded border border-slate-500 bg-slate-900 px-1.5 py-0.5 text-sm disabled:opacity-40" title="Go to start">|◀</GameButton>
                        <GameButton onPress={() => void stepBackward()} disabled={loading || disabled || (!hasBefore && sliceIndex <= 0)} className="rounded border border-slate-500 bg-slate-900 px-1.5 py-0.5 text-sm disabled:opacity-40" title="Previous time slice">◀</GameButton>
                        <GameButton
                            onPress={() => setPlaying((value) => !value)}
                            disabled={loading || disabled || !currentSlice}
                            className={`rounded border flex items-center justify-center w-6 px-1.5 py-0.5 text-sm disabled:opacity-40 ${
                                playing
                                    ? "border-yellow-300/50 bg-yellow-500/15 text-yellow-100"
                                    : "border-green-300/40 bg-green-500/10 text-green-100"
                            }`}
                            title={playing ? "Pause" : "Play"}
                        >
                            {playing ? "⏸" : "▶"}
                        </GameButton>
                        <GameButton onPress={() => void stepForward()} disabled={loading || disabled || (!hasAfter && sliceIndex + 1 >= slices.length)} className="rounded border border-slate-500 bg-slate-900 px-1.5 py-0.5 text-sm disabled:opacity-40" title="Next time slice">▶</GameButton>
                        <GameButton onPress={() => void goToEnd()} disabled={loading || disabled} className="rounded border border-slate-500 bg-slate-900 px-1.5 py-0.5 text-sm disabled:opacity-40" title="Go to end">▶|</GameButton>
                        <GameButton onPress={() => void stopPlayback()} disabled={loading || disabled} className="rounded border border-red-300/40 bg-red-500/10 px-1.5 py-0.5 text-sm disabled:opacity-40" title="Stop and reset to start">■</GameButton>
                        <GameButton onPress={() => setLoop((value) => !value)} disabled={disabled} className={`rounded border px-1.5 py-0.5 text-sm ${loop ? "border-cyan-300 bg-cyan-500/20 text-cyan-100" : "border-slate-600 bg-slate-900 text-slate-400"}`} title="Repeat continuously">↻</GameButton>

                        <select value={speed} onChange={(event: ChangeEvent<HTMLSelectElement>) => setSpeed(Number(event.target.value))} className="rounded border border-slate-600 bg-slate-950 px-0.5 py-1 text-xs text-green-100">
                            {SPEEDS.map((value) => <option key={value} value={value}>{value}x</option>)}
                        </select>
                        <select value={toleranceMs} onChange={(event: ChangeEvent<HTMLSelectElement>) => setToleranceMs(Number(event.target.value))} className="rounded border border-slate-600 bg-slate-950 px-0.5 py-1 text-xs text-green-100" title="Frames within this server-time bucket are one playback slice">
                            {TOLERANCES.map((value) => <option key={value} value={value}>{value} ms</option>)}
                        </select>
                    </div>
                </div>

                <div className="grid gap-2 px-2 sm:grid-cols-[1fr_auto]">
                    <div className="min-w-0">
                        <div className="relative h-6 pt-2.5">
                            <div
                                className="pointer-events-none absolute inset-x-2 top-0 z-10 h-7"
                                aria-label="Session markers"
                            >
                                {markers.map((marker) => {
                                    const percent = markerPercent(marker, progressStart, progressEnd);
                                    const selected = marker.id === activeMarkerId;
                                    return (
                                        <button
                                            key={marker.id}
                                            type="button"
                                            onClick={() => void seekToMarker(marker)}
                                            disabled={loading || disabled}
                                            className="pointer-events-auto group absolute top-0 h-7 w-5 -translate-x-1/2 disabled:cursor-not-allowed disabled:opacity-40"
                                            style={{ left: `${percent}%` }}
                                            title={`${formatTime(marker.timestamp_ms)} · ${markerTitle(marker)} · ${marker.marker_type}`}
                                            aria-label={`Seek to ${markerTitle(marker)} at ${formatTime(marker.timestamp_ms)}`}
                                        >
                                            <span className={`absolute left-1/2 top-1 h-5 w-0.5 -translate-x-1/2 ${selected ? "bg-white" : "bg-slate-400"}`} />
                                            <span className={`absolute left-1/2 top-1 h-2.5 w-2.5 -translate-x-1/2 rotate-45 border ${markerTone(marker.marker_type)} ${selected ? "ring-2 ring-white" : "group-hover:ring-2 group-hover:ring-cyan-200"}`} />
                                        </button>
                                    );
                                })}
                            </div>
                            <input
                                type="range"
                                min={progressStart}
                                max={progressEnd}
                                value={Math.min(Math.max(progressValue, progressStart), progressEnd)}
                                onChange={(event: ChangeEvent<HTMLInputElement>) => void seek(Number(event.target.value))}
                                disabled={loading || disabled || !meta?.frame_count}
                                className="relative z-0 w-full accent-green-400"
                                aria-label="Playback position"
                            />
                        </div>
                        <div className="flex justify-between text-[10px] text-slate-500">
                            <span>{formatTime(progressStart)}</span>
                            <span className="text-green-200">{formatTime(progressValue)} · {progressPercent.toFixed(1)}%</span>
                            <span>{formatTime(progressEnd)}</span>
                        </div>

                        <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-1 pb-1">
                            <GameButton
                                onPress={() => void stepMarker(-1)}
                                disabled={loading || disabled || !markers.length || activeMarkerIndex === 0}
                                className="rounded border border-slate-600 bg-slate-900 flex items-center h-8 text-[10px] text-slate-300 disabled:opacity-30"
                                title="Previous mission marker"
                            >
                                ◀ MARK
                            </GameButton>

                            <div
                                className={`min-w-0 rounded border h-8 flex flex-col px-0.5 justify-center text-center text-[10px] font-black ${
                                    activeMarker
                                        ? markerTone(activeMarker.marker_type)
                                        : "border-slate-700 bg-slate-950 text-slate-500"
                                }`}
                                title={
                                    activeMarker
                                        ? `${activeMarker.marker_type} · ${activeMarker.label ?? "no label"}`
                                        : "Select a marker from the progress bar or use the marker buttons."
                                }
                            >
                                <span className="block truncate">
                                    {activeMarker
                                        ? `MARK ${activeMarkerIndex + 1}/${markers.length} · ${formatTime(activeMarker.timestamp_ms)} · ${markerTitle(activeMarker)}`
                                        : markers.length
                                            ? `${markers.length} MARKERS · SELECT FROM TIMELINE`
                                            : "NO SESSION MARKERS"}
                                </span>
                                {activeMarker && (
                                    <span className="block justify-start truncate text-[9px] font-normal opacity-75">
                                        nearest slice {markerOffsetMs === null ? "—" : `${markerOffsetMs >= 0 ? "+" : ""}${markerOffsetMs}ms`}
                                        {" · "}{currentChangedFrames} Δframe{currentChangedFrames > 1? "s" : ""}
                                        {" · "}{currentChangedBytes} Δbyte{currentChangedBytes > 1? "s" : ""}
                                    </span>
                                )}
                            </div>

                            <GameButton
                                onPress={() => void stepMarker(1)}
                                disabled={loading || disabled || !markers.length || activeMarkerIndex === markers.length - 1}
                                className="rounded border border-slate-600 bg-slate-900 h-8 flex items-center text-[10px] text-slate-300 disabled:opacity-30"
                                title="Next mission marker"
                            >
                                MARK ▶
                            </GameButton>
                        </div>
                    </div>
                </div>

                <div className="px-2 pb-1 grid grid-cols-3 gap-1 sm:grid-cols-6">
                    <div ref={idMenuRef} className="relative z-30">
                        <button
                            type="button"
                            onClick={() => setIdMenuOpen((open) => !open)}
                            aria-expanded={idMenuOpen}
                            aria-haspopup="listbox"
                            className="flex h-full w-full items-center justify-between gap-2 rounded border border-slate-600 bg-slate-950 px-2 py-0.5 text-left text-xs text-green-100"
                        >
                            <span className="truncate">
                                {selectedCanIds.length
                                    ? `${selectedCanIds.length} ID${selectedCanIds.length === 1 ? "" : "S"} SELECTED`
                                    : "ALL CAN IDS"}
                            </span>
                            <span className={`shrink-0 text-slate-500 transition-transform ${idMenuOpen ? "rotate-180" : ""}`}>
                                ▾
                            </span>
                        </button>

                        {idMenuOpen && (
                            <div className="absolute left-0 top-full z-50 mt-1 flex max-h-[min(24rem,65dvh)] w-72 max-w-[calc(100vw-1rem)] flex-col overflow-hidden rounded border border-cyan-300/30 bg-slate-950 shadow-2xl shadow-black/70">
                                <div className="sticky top-0 z-10 flex shrink-0 items-center gap-1 border-b border-slate-800 bg-slate-950 p-2">
                                    <input
                                        value={idFilterSearch}
                                        onChange={(event: ChangeEvent<HTMLInputElement>) =>
                                            setIdFilterSearch(event.target.value)
                                        }
                                        placeholder="Find hex or decimal ID"
                                        className="min-w-0 flex-1 rounded border border-slate-700 bg-black/40 px-2 py-1 text-xs text-cyan-100 placeholder:text-slate-600"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setSelectedCanIds([])}
                                        className="rounded border border-red-300/30 bg-red-500/10 px-2 py-1 text-[10px] font-black text-red-100"
                                    >
                                        ALL
                                    </button>
                                </div>

                                <div
                                    className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
                                    role="listbox"
                                    aria-multiselectable="true"
                                >
                                    {visibleCanIdOptions.map((canId) => (
                                        <label
                                            key={canId}
                                            className="flex cursor-pointer items-center justify-between gap-3 border-b border-slate-800 px-2 py-1.5 text-xs hover:bg-cyan-500/10"
                                        >
                                            <span className="flex items-center gap-2">
                                                <input
                                                    type="checkbox"
                                                    checked={selectedCanIds.includes(canId)}
                                                    onChange={() => toggleCanId(canId)}
                                                />
                                                <span className="font-black text-cyan-200">
                                                    {canIdHex(canId)}
                                                </span>
                                            </span>
                                            <span className="text-slate-500">{canId}</span>
                                        </label>
                                    ))}
                                    {!visibleCanIdOptions.length && (
                                        <p className="p-3 text-center text-xs text-slate-500">
                                            No CAN IDs match this search.
                                        </p>
                                    )}
                                </div>

                                <p className="shrink-0 border-t border-slate-800 bg-slate-950 p-2 text-[10px] text-slate-500">
                                    No selection means all IDs. Selected IDs are pinned in numeric order and keep their last known cold state between transmissions. Search, delta, and byte filters temporarily use event rows only.
                                </p>
                            </div>
                        )}
                    </div>
                    <input value={search} onChange={(event: ChangeEvent<HTMLInputElement>) => setSearch(event.target.value)} placeholder="ID, hex, digit" className="rounded border border-slate-600 bg-slate-950 px-2 py-0.5 text-xs text-green-100 placeholder:text-slate-600" />
                    <select value={byteIndex} onChange={(event: ChangeEvent<HTMLSelectElement>) => setByteIndex(event.target.value)} className="rounded border border-slate-600 bg-slate-950 px-2 py-0.5 text-xs text-green-100">
                        <option value="">Any byte</option>
                        {Array.from({ length: 8 }, (_, index) => <option key={index} value={index}>Byte B{index}</option>)}
                    </select>
                    <input value={byteValue} onChange={(event: ChangeEvent<HTMLInputElement>) => setByteValue(event.target.value)} placeholder="Byte value: 47 / 2F" className="rounded border border-slate-600 bg-slate-950 px-2 py-0.5 text-xs text-green-100 placeholder:text-slate-600" />
                    <label className="flex items-center gap-2 rounded border border-slate-700 bg-slate-950 p-0.5  text-[10px] text-slate-300">
                        <input type="checkbox" checked={deltasOnly} onChange={(event: ChangeEvent<HTMLInputElement>) => setDeltasOnly(event.target.checked)} />DELTAS (Δ)
                    </label>
                    <div className="flex gap-1">
                        <label className="flex flex-1 items-center gap-1 rounded border border-slate-700 bg-slate-950 p-0.5 text-[10px] text-slate-300">
                            <input type="checkbox" checked={byteChangedOnly} onChange={(event: ChangeEvent<HTMLInputElement>) => setByteChangedOnly(event.target.checked)} disabled={byteIndex === ""} />BYTE Δ
                        </label>
                        <GameButton onPress={clearFilters} className="rounded border border-red-300/30 bg-red-500/10 p-0.5  text-[10px] text-red-100">CLEAR</GameButton>
                    </div>
                </div>
            </div>

            {error && (
                <div className="shrink-0 border border-red-300/40 bg-red-500/10 text-xs text-red-100">
                    {error}
                </div>
            )}

            <div
                className={`min-h-0 flex-1 gap-2 pb-2 ${
                    selectedByte
                        ? "grid grid-rows-[minmax(12rem,1fr)_minmax(14rem,42dvh)] lg:grid-cols-[minmax(0,1fr)_360px] lg:grid-rows-1"
                        : "grid grid-cols-1"
                }`}
            >
                <div className="min-h-0 min-w-0 overflow-auto bg-black/50">
                    <div className="flex h-5 items-center justify-between border-b border-slate-800 bg-slate-950/80 px-1 text-[9px] text-slate-500">
                        <span>
                            {persistentSelectionActive
                                ? `${selectedCanIds.length} PINNED ID${selectedCanIds.length === 1 ? "" : "S"} · FIXED ROW ORDER`
                                : `${displayFrames.length} EVENT ROW${displayFrames.length === 1 ? "" : "S"}`}
                        </span>
                        {persistentSelectionActive && (
                            <span>{coldStateCount} COLD · {displayFrames.length - coldStateCount} CURRENT</span>
                        )}
                    </div>
                    <table className="w-full min-w-[320px] table-auto border-collapse text-left text-[10px] sm:min-w-[455px] sm:text-xs xl:min-w-[720px]">
                        <thead className="sticky top-0 z-10 bg-emerald-950/95 text-green-100">
                            <tr className="h-5">
                                <th className="w-[66px] border-b border-r border-green-300/30 px-1 py-0">ID</th>
                                <th className="hidden w-[66px] border-b border-r border-green-300/30 px-1 py-0 sm:table-cell">Time</th>
                                <th className="hidden w-[26px] border-b border-r border-green-300/30 px-0.5 py-0 lg:table-cell">Ln</th>
                                <th className="border-b border-r border-green-300/30 px-0.5 py-0">
                                    <div className="grid grid-cols-8 gap-px" title="Payload byte positions; click a byte value below to inspect it">
                                        {Array.from({ length: 8 }, (_, index) => (
                                            <span
                                                key={index}
                                                className={`${BYTE_CELL_CLASS} border-green-300/30 bg-slate-900 text-green-200`}
                                            >
                                                B{index}
                                            </span>
                                        ))}
                                    </div>
                                </th>
                                <th className="hidden w-[130px] border-b border-r border-green-300/30 px-1 py-0 xl:table-cell">Label</th>
                                <th className="hidden w-[200px] border-b border-green-300/30 px-1 py-0 xl:table-cell">Decoded</th>
                            </tr>
                        </thead>
                        <tbody>
                            {displayFrames.map((frame) => {
                                const cold = frame.state_carried === true;
                                const unavailable = frame.state_available === false;
                                const rowChanged = !cold && frame.changed;
                                const rowKey = persistentSelectionActive
                                    ? `state:${frame.can_id}`
                                    : `frame:${frame.id}`;
                                return (
                                    <tr
                                        key={rowKey}
                                        className={`h-6 border-b border-slate-800 hover:bg-green-500/5 ${cold || unavailable ? "bg-slate-950/70" : ""}`}
                                    >
                                        <td
                                            className="whitespace-nowrap border-r border-slate-800 px-1 py-0 font-black text-cyan-300"
                                            title={`${frame.can_id_hex}${frame.signal_name ? ` · ${frame.signal_name}` : ""}`}
                                        >
                                            <span>{frame.can_id_hex}</span>
                                            <span className={`ml-1 text-[8px] ${rowChanged
                                                ? "text-cyan-200"
                                                : cold
                                                    ? "text-slate-600"
                                                    : unavailable
                                                        ? "text-slate-700"
                                                        : "text-green-400"
                                            }`}>
                                                {rowChanged ? "Δ" : cold ? "○" : unavailable ? "?" : "•"}
                                            </span>
                                        </td>
                                        <td className="hidden whitespace-nowrap border-r border-slate-800 px-1 py-0 text-cyan-300 sm:table-cell">
                                            {unavailable ? "—" : formatTime(frame.timestamp_ms)}
                                            {cold && typeof frame.state_age_ms === "number" && (
                                                <span className="ml-1 text-[8px] text-slate-600">+{frame.state_age_ms}ms</span>
                                            )}
                                        </td>
                                        <td className="hidden border-r border-slate-800 px-0.5 py-0 text-slate-500 lg:table-cell">
                                            {unavailable ? "—" : frame.dlc}
                                        </td>
                                        <td className="border-r border-slate-800 px-0.5 py-0">
                                            <div className="grid grid-cols-8 gap-px">
                                                {Array.from({ length: 8 }, (_, index) => {
                                                    const value = frame.bytes[index];
                                                    const byteAvailable = !unavailable && index < frame.dlc && typeof value === "number";
                                                    const changed = byteAvailable && !cold && frame.delta_positions.includes(index);
                                                    const selected = byteAvailable
                                                        && selectedByte?.frame.id === frame.id
                                                        && selectedByte.byteIndex === index;
                                                    return (
                                                        <button
                                                            key={index}
                                                            type="button"
                                                            disabled={!byteAvailable}
                                                            onClick={() => {
                                                                setPlaying(false);
                                                                setSelectedByte({ frame, byteIndex: index });
                                                            }}
                                                            className={`${BYTE_CELL_CLASS} ${selected
                                                                ? "border-yellow-200 bg-yellow-500/20 text-yellow-100"
                                                                : changed
                                                                    ? "border-cyan-300/70 bg-cyan-500/25 text-cyan-100"
                                                                    : cold
                                                                        ? "border-slate-800 bg-slate-950 text-slate-600"
                                                                        : byteAvailable
                                                                            ? "border-slate-700 bg-slate-900 text-slate-400"
                                                                            : "border-slate-900 bg-black/20 text-slate-800"
                                                            } disabled:cursor-default`}
                                                            title={byteAvailable
                                                                ? `B${index}: hex ${byteHex(value)}, decimal ${value}${changed ? ", changed in this slice" : cold ? ", carried from the last transmission" : ""}`
                                                                : `B${index}: no state available yet`}
                                                        >
                                                            {byteAvailable ? byteHex(value) : "--"}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </td>
                                        <td className="hidden max-w-[130px] truncate border-r border-slate-800 px-1 py-0 text-cyan-300 xl:table-cell">
                                            {frame.signal_name ?? "—"}
                                        </td>
                                        <td className="hidden max-w-[200px] truncate px-1 py-0 text-slate-400 xl:table-cell">
                                            {decodedText(frame.decoded)}
                                        </td>
                                    </tr>
                                );
                            })}
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

                {selectedByte && (
                <aside className="min-h-0 overflow-y-auto border border-cyan-300/20 bg-slate-950/95">
                    <div className="sticky top-0 z-10 flex items-center justify-between border-b border-cyan-300/20 bg-slate-950 px-2 py-1">
                        <p className="text-[10px] tracking-[0.25em] text-cyan-300">
                            BYTE ROLE REVIEW
                        </p>
                        <button
                            type="button"
                            onClick={() => setSelectedByte(null)}
                            className="rounded border border-slate-600 bg-slate-900 px-2 py-0.5 text-[10px] font-black text-slate-300 hover:bg-slate-800"
                            aria-label="Close byte role review"
                        >
                            CLOSE
                        </button>
                    </div>
                    <div className="mt-1 space-y-1">
                            <div className="border border-green-300/30 bg-green-500/10 px-2 pb-2">
                                <p className="font-black text-green-100">
                                    {selectedByte.frame.can_id_hex} / B{selectedByte.byteIndex}
                                </p>
                                <div className="grid grid-cols-2 gap-0.5 text-[10px] text-slate-400">
                                    <p>current: <span className="text-cyan-200">0x{byteHex(selectedByte.frame.bytes[selectedByte.byteIndex])} / {selectedByte.frame.bytes[selectedByte.byteIndex]}</span></p>
                                    <p>previous: <span className="text-slate-200">{selectedByte.frame.previous_bytes ? `0x${byteHex(selectedByte.frame.previous_bytes[selectedByte.byteIndex])} / ${selectedByte.frame.previous_bytes[selectedByte.byteIndex]}` : "none"}</span></p>
                                    <p>changed: <span className={selectedByte.frame.delta_positions.includes(selectedByte.byteIndex) ? "text-cyan-200" : "text-slate-500"}>{selectedByte.frame.delta_positions.includes(selectedByte.byteIndex) ? "YES" : "NO"}</span></p>
                                    <p>server time: <span className="text-slate-200">{formatTime(selectedByte.frame.timestamp_ms)}</span></p>
                                </div>
                                <div className="rounded border border-cyan-300/20 bg-black/30 p-2">
                                    <div className="grid grid-cols-[58px_repeat(8,minmax(0,1fr))] gap-1 text-center text-[9px]">
                                        <span className="text-left text-slate-500">bit</span>
                                        {[7, 6, 5, 4, 3, 2, 1, 0].map((bit) => (
                                            <span key={bit} className="text-slate-500">{bit}</span>
                                        ))}
                                        <span className="text-left text-slate-500">previous</span>
                                        {bitString(selectedByte.frame.previous_bytes?.[selectedByte.byteIndex]).split("").map((bit, index) => (
                                            <span key={`previous-${index}`} className="rounded border border-slate-700 bg-slate-900 py-0.5 text-slate-300">{bit}</span>
                                        ))}
                                        <span className="text-left text-cyan-300">current</span>
                                        {bitString(selectedByte.frame.bytes[selectedByte.byteIndex]).split("").map((bit, index) => {
                                            const previousValue = selectedByte.frame.previous_bytes?.[selectedByte.byteIndex];
                                            const currentValue = selectedByte.frame.bytes[selectedByte.byteIndex];
                                            const mask = typeof previousValue === "number" ? previousValue ^ currentValue : 0;
                                            const bitNumber = 7 - index;
                                            const changed = Boolean(mask & (1 << bitNumber));
                                            return (
                                                <span
                                                    key={`current-${index}`}
                                                    className={`rounded border py-0.5 font-black ${changed ? "border-yellow-200 bg-yellow-500/30 text-yellow-100" : "border-slate-700 bg-slate-900 text-cyan-200"}`}
                                                >
                                                    {bit}
                                                </span>
                                            );
                                        })}
                                    </div>
                                    <p className="mt-1 text-[10px] text-slate-500">
                                        XOR mask: <span className="font-black text-yellow-200">0x{byteHex(
                                            typeof selectedByte.frame.previous_bytes?.[selectedByte.byteIndex] === "number"
                                                ? selectedByte.frame.previous_bytes[selectedByte.byteIndex] ^ selectedByte.frame.bytes[selectedByte.byteIndex]
                                                : 0,
                                        )}</span> · yellow bits changed from the previous frame for this CAN ID
                                    </p>
                                </div>
                            </div>

                            {ROLE_OPTIONS.map((role) => {
                                const saved = hypothesisFor(
                                    selectedByte.frame.can_id,
                                    selectedByte.byteIndex,
                                    role.kind,
                                );
                                const roleKey = `${selectedByte.frame.can_id}:${selectedByte.byteIndex}:${role.kind}`;
                                const feedback = roleFeedback[roleKey];
                                const saving = savingRole === roleKey || feedback?.state === "saving";
                                const effectiveStatus = feedback?.state !== "error"
                                    ? feedback?.validationStatus ?? saved?.validation_status
                                    : saved?.validation_status;
                                const statusLabel = saving
                                    ? "SAVING…"
                                    : feedback?.state === "saved"
                                        ? `${effectiveStatus?.toUpperCase()} SAVED`
                                        : effectiveStatus?.toUpperCase() ?? "UNREVIEWED";
                                return (
                                    <div key={role.kind} className={`border px-2 py-1 ${statusTone(effectiveStatus)}`}>
                                        <div className="flex items-start justify-between gap-2">
                                            <div>
                                                <p className="font-black text-green-100">{role.label}?</p>
                                                <p className="text-[10px] leading-relaxed text-slate-500">{role.description}</p>
                                            </div>
                                            <span className={`rounded border px-1.5 py-0.5 text-[9px] font-black ${statusTone(effectiveStatus)}`}>
                                                {statusLabel}
                                            </span>
                                        </div>
                                        {saved?.notes && (
                                            <p className="mt-2 text-[10px] text-cyan-100/70">auto: {saved.notes}</p>
                                        )}
                                        <div className="grid grid-cols-3 gap-1">
                                            <GameButton onPress={() => void validateRole(role.kind, "positive")} disabled={saving} className={`rounded border px-1.5 py-0.5 text-[10px] disabled:opacity-40 ${effectiveStatus === "positive" ? "border-green-200 bg-green-500/30 text-green-50 ring-1 ring-green-300" : "border-green-300/40 bg-green-500/10 text-green-100"}`}>{effectiveStatus === "positive" ? "✓ CONFIRMED" : "CONFIRM"}</GameButton>
                                            <GameButton onPress={() => void validateRole(role.kind, "negative")} disabled={saving} className={`rounded border px-1.5 py-0.5 text-[10px] disabled:opacity-40 ${effectiveStatus === "negative" ? "border-red-200 bg-red-500/30 text-red-50 ring-1 ring-red-300" : "border-red-300/40 bg-red-500/10 text-red-100"}`}>{effectiveStatus === "negative" ? "✓ REJECTED" : "REJECT"}</GameButton>
                                            <GameButton onPress={() => void validateRole(role.kind, "uncertain")} disabled={saving} className={`rounded border px-1.5 py-0.5 text-[10px] disabled:opacity-40 ${effectiveStatus === "uncertain" ? "border-yellow-200 bg-yellow-500/30 text-yellow-50 ring-1 ring-yellow-300" : "border-yellow-300/40 bg-yellow-500/10 text-yellow-100"}`}>{effectiveStatus === "uncertain" ? "✓ UNSURE" : "UNSURE"}</GameButton>
                                        </div>
                                    </div>
                                );
                            })}
                    </div>
                </aside>
                )}
            </div>
        </div>
    );
}