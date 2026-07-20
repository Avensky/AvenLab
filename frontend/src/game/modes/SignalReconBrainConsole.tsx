import { useMemo, useState } from "react";
import { GameButton } from "../../components/GameButton";

export type CandidateMlLabelValue = "positive" | "negative" | "uncertain";

export type CandidateMlLabel = {
    can_id: number;
    can_id_hex: string;
    label: CandidateMlLabelValue;
    signal_name: string | null;
    notes: string | null;
    source: string;
    bus_interface: string | null;
    bus_mode: string | null;
    capture_kind: string | null;
    created_at: string | null;
    updated_at: string | null;
    metadata?: Record<string, unknown>;
};

export type MlReadiness = {
    ok: boolean;
    ready_to_train: boolean;
    counts: {
        positive: number;
        negative: number;
        uncertain: number;
    };
    compatible_counts?: {
        positive: number;
        negative: number;
    };
    compatible_trainable_labels?: number;
    distinct_sessions: number;
    minimum_examples?: number;
    minimum_distinct_sessions?: number;
    recommended_distinct_sessions?: number;
    missing?: {
        total: number;
        positive: number;
        negative: number;
        distinct_sessions: number;
    };
    scope?: Record<string, string | null>;
};

export type MlModelSummary = {
    id: string;
    vehicle_slug?: string;
    mission_code?: string | null;
    bus_interface?: string | null;
    bus_mode?: string | null;
    capture_kind?: string | null;
    model_type?: string;
    label_count?: number;
    positive_count?: number;
    negative_count?: number;
    is_active?: boolean;
    created_at?: string | null;
    metrics?: Record<string, unknown>;
};

export type ByteRoleHypothesis = {
    byte_index: number;
    hypothesis_kind: string;
    confidence: number;
    bit_mask?: number | null;
    auto_detected?: boolean;
    source?: string;
    validation_status?: "unreviewed" | "positive" | "negative" | "uncertain";
    reason: string;
    metrics?: Record<string, unknown>;
};

export type BitSignalActionGroup = {
    polarity?: "on" | "off" | null;
    repetitions?: number;
    matched_repetitions?: number;
    consensus_pre_state?: number | null;
    consensus_action_state?: number | null;
    consensus_post_state?: number | null;
    flip_counts?: number[];
};

export type FieldMarkerObservation = {
    marker_type: string;
    step_code?: string | null;
    label?: string | null;
    action_key: string;
    timestamp_ms: number;
    expected_value: number;
    expected_unit?: string | null;
    expected_direction?: string | null;
    pre_value?: number | null;
    action_value?: number | null;
    post_value?: number | null;
    plateau_mad?: number | null;
    response_latency_ms?: number | null;
    hold_ms: number;
};

export type FieldSignalHypothesis = {
    start_byte: number;
    width_bits: number;
    endianness: string;
    signed: boolean;
    score: number;
    monotonicity: number;
    observed_direction: string;
    level_separation: number;
    repeatability: number;
    plateau_stability: number;
    return_consistency: number;
    outside_action_drift: number;
    response_latency_score: number;
    marker_coverage: number;
    location_dominance: number;
    baseline_penalty?: number;
    baseline_adjusted_score?: number | null;
    expected_levels: number[];
    observed_level_medians: Record<string, number>;
    observations: FieldMarkerObservation[];
    reason: string;
};

export type BitSignalHypothesis = {
    byte_index: number;
    bit_index: number;
    bit_mask: number;
    score: number;
    marker_lift: number;
    window_purity: number;
    outside_action_fraction: number;
    repetition_score: number;
    single_flip_score: number;
    location_dominance: number;
    total_flips: number;
    in_window_flips: number;
    out_of_window_flips: number;
    matched_repetitions: number;
    total_repetitions: number;
    inverse_pair_verified: boolean;
    median_latency_ms?: number | null;
    baseline_penalty?: number;
    baseline_adjusted_score?: number | null;
    action_groups: Record<string, BitSignalActionGroup>;
    reason: string;
};

export type BrainCandidate = {
    can_id: number;
    can_id_hex: string;
    frame_count: number;
    frequency_hz: number | null;
    change_count: number;
    change_ratio?: number;
    changed_frame_ratio?: number;
    byte_change_counts: Record<string, number>;
    byte_role_hypotheses?: ByteRoleHypothesis[];
    signal_hypotheses?: BitSignalHypothesis[];
    field_hypotheses?: FieldSignalHypothesis[];
    analyzer_profile?: string;
    quick_id_method?: string;
    entropy: number;
    correlation_score: number;
    confidence: number;
    likely_marker_types: string[];
    notes: string;
    candidate_role?: string;
    baseline_applied?: boolean;
    baseline_overlap_score?: number;
    baseline_penalty?: number;
    baseline_adjusted_change_ratio?: number;
    confidence_before_baseline?: number;
    ml_applied?: boolean;
    ml_model_id?: string | null;
    ml_probability?: number | null;
    ml_blend_weight?: number;
    confidence_before_ml?: number;
    historical_support?: {
        retrieved_sessions?: number;
        seen_sessions?: number;
        top_five_sessions?: number;
        same_active_bytes_sessions?: number;
        mean_similarity?: number | null;
        label_counts?: {
            positive?: number;
            negative?: number;
            uncertain?: number;
        };
        confidence_influence?: boolean;
    };
};

export type VectorMemoryMatch = {
    embedding_id?: string;
    session_id: string;
    similarity: number;
    mission_code?: string | null;
    bus_interface?: string | null;
    bus_mode?: string | null;
    capture_kind?: string | null;
    analysis_mode?: string | null;
    created_at?: string | null;
};

export type VectorMemoryContext = {
    requested: boolean;
    query_embedded?: boolean;
    retrieved?: boolean;
    stored?: boolean;
    match_count?: number;
    minimum_similarity?: number;
    confidence_influence?: boolean;
    reason?: string;
    error?: string;
    storage_error?: string | null;
    matches?: VectorMemoryMatch[];
    scope?: Record<string, string | null>;
};

export type MarkerSelectionContext = {
    strategy?: string;
    action_markers?: number;
    explicit_action_markers?: number;
    control_markers?: number;
    ignored_markers?: number;
    unknown_markers?: number;
    fallback_used?: boolean;
    action_keys?: string[];
    window_coverage?: number;
};

export type FrameSelectionContext = {
    total_frames?: number;
    max_frames?: number;
    selected_frames?: number;
    truncated?: boolean;
    strategy?: string;
    segment_count?: number;
    action_marker_count?: number;
    warning?: string;
};

export type BrainAnalysisResult = {
    ok: boolean;
    session_id: string;
    session_integrity?: {
        capture_status?: string;
        finalized_at?: string | null;
        final_frame_count?: number | null;
        final_marker_count?: number | null;
        timestamp_authority?: string;
        capture_quality?: Record<string, unknown>;
    };
    byte_hypothesis_count?: number;
    field_hypothesis_count?: number;
    analysis_mode?: "baseline_profile" | "target_correlation" | string;
    analyzer_profile?: string;
    analysis_source?: "llm" | "fallback";
    llm_requested?: boolean;
    llm_succeeded?: boolean;
    target_expected?: boolean;
    baseline_profile?: {
        kind?: string;
        target_expected?: boolean;
        total_frames?: number;
        observed_ids?: number;
        high_rate_ids?: Array<Record<string, unknown>>;
        noisy_ids?: Array<Record<string, unknown>>;
        stable_ids?: Array<Record<string, unknown>>;
        guidance?: string;
    };
    frames_analyzed: number;
    frames_available?: number;
    markers: number;
    selected_action_markers?: number;
    marker_selection?: MarkerSelectionContext | null;
    frame_selection?: FrameSelectionContext | null;
    confidence_semantics?: string;
    quick_id_method?: string;
    marker_window_ms?: number;
    marker_window_coverage?: number;
    vector_memory?: VectorMemoryContext | null;
    candidates: BrainCandidate[];
    heatmap: Record<
        string,
        {
            can_id: number;
            byte_change_counts: Record<string, number>;
            change_count: number;
            frame_count: number;
            frequency_hz: number | null;
            confidence?: number;
            correlation_score?: number;
            candidate_role?: string;
            change_ratio?: number;
            baseline_score?: number;
            baseline_overlap_score?: number;
        }
    >;
    llm_model: string | null;
    llm_available: boolean;
    llm_error: string | null;
    analysis: string | null;
    persisted: boolean;
};

type BrainTab = "summary" | "candidates" | "all_ids" | "heatmap" | "llm" | "logs";

export type CandidateLabelMetadata = {
    validation_method?: string;
    independent_sessions?: number;
    baseline_checked?: boolean;
    return_state_verified?: boolean;
};

export type CandidateLabelTarget = {
    can_id: number;
    can_id_hex: string;
};

type CandidateSaveFeedback = {
    label: CandidateMlLabelValue;
    state: "saving" | "saved" | "error";
};

type HypothesisSaveFeedback = {
    validationStatus: "positive" | "negative" | "uncertain";
    state: "saving" | "saved" | "error";
};

type SignalReconBrainConsoleProps = {
    open: boolean;
    analyzing: boolean;
    error: string | null;
    analysis: BrainAnalysisResult | null;
    logs: string[];
    sessionId: string | null;
    missionCode: string;
    missionTitle: string;
    signalName: string;
    vehicleSlug: string;
    busInterface: string;
    busMode: string;
    sourceLabel: string;
    useLlm: boolean;
    useEmbeddings: boolean;
    autoAnalyze: boolean;
    mlLabels: Record<string, CandidateMlLabel>;
    mlReadiness: MlReadiness | null;
    activeModel: MlModelSummary | null;
    mlLoading: boolean;
    labelingCandidateId: number | null;
    onClose: () => void;
    onAnalyze: () => void;
    onExplainWithLlm: () => void;
    onLoadLatest: () => void;
    onExportSession: () => void;
    onDeleteSession: () => void;
    onRefreshMl: () => void;
    onLabelCandidate: (
        candidate: CandidateLabelTarget,
        label: CandidateMlLabelValue,
        notes: string,
        metadata: CandidateLabelMetadata,
    ) => Promise<boolean> | boolean;
    onValidateByteHypothesis: (
        candidate: BrainCandidate,
        hypothesis: ByteRoleHypothesis,
        validationStatus: "positive" | "negative" | "uncertain",
    ) => Promise<boolean> | boolean;
    onToggleLlm: () => void;
    onToggleEmbeddings: () => void;
    onToggleAutoAnalyze: () => void;
};

const TABS: Array<{ id: BrainTab; label: string }> = [
    { id: "summary", label: "SUMMARY" },
    { id: "candidates", label: "TOP IDS" },
    { id: "all_ids", label: "ALL IDS" },
    { id: "heatmap", label: "HEAT" },
    { id: "llm", label: "LLM" },
    { id: "logs", label: "LOG" },
];

function percent(value: number | null | undefined) {
    if (typeof value !== "number" || Number.isNaN(value)) return "—";
    return `${Math.round(value * 100)}%`;
}

function fixed(value: number | null | undefined, digits = 3) {
    if (typeof value !== "number" || Number.isNaN(value)) return "—";
    return value.toFixed(digits);
}

function shortSessionId(sessionId: string | null) {
    if (!sessionId) return "not started";
    if (sessionId.length <= 14) return sessionId;
    return `${sessionId.slice(0, 8)}…${sessionId.slice(-4)}`;
}

function candidateTone(confidence: number) {
    if (confidence >= 0.75) return "border-green-300/50 bg-green-500/10 text-green-100";
    if (confidence >= 0.45) return "border-yellow-300/50 bg-yellow-500/10 text-yellow-100";
    return "border-slate-600 bg-slate-900/80 text-slate-300";
}

function labelTone(label: CandidateMlLabelValue | undefined) {
    if (label === "positive") return "border-green-300/50 bg-green-500/15 text-green-100";
    if (label === "negative") return "border-red-300/50 bg-red-500/15 text-red-100";
    if (label === "uncertain") return "border-yellow-300/50 bg-yellow-500/15 text-yellow-100";
    return "border-slate-700 bg-slate-950 text-slate-500";
}

function labelText(label: CandidateMlLabelValue | undefined) {
    if (label === "positive") return "VALIDATED RELEVANT";
    if (label === "negative") return "VALIDATED BACKGROUND";
    if (label === "uncertain") return "NEEDS MORE EVIDENCE";
    return "UNLABELED";
}

function hypothesisTone(kind: string) {
    if (kind === "rolling_counter") return "border-cyan-300/40 bg-cyan-500/10 text-cyan-100";
    if (kind === "checksum_candidate") return "border-purple-300/40 bg-purple-500/10 text-purple-100";
    if (kind === "constant") return "border-slate-600 bg-slate-900 text-slate-400";
    if (kind === "periodic_or_state_bits") return "border-yellow-300/40 bg-yellow-500/10 text-yellow-100";
    return "border-green-300/30 bg-green-500/5 text-green-100";
}

function formatMask(mask: number | null | undefined) {
    if (typeof mask !== "number") return "—";
    return `0x${mask.toString(16).toUpperCase().padStart(2, "0")}`;
}

function stateTransition(group: BitSignalActionGroup) {
    const before = group.consensus_pre_state;
    const after = group.consensus_action_state;
    if (before === null || before === undefined || after === null || after === undefined) return "unresolved";
    return `${before}→${after}`;
}

function byteCells(byteCounts: Record<string, number>) {
    const max = Math.max(1, ...Object.values(byteCounts));

    return Array.from({ length: 8 }, (_, index) => {
        const count = byteCounts[String(index)] ?? 0;
        const opacity = Math.max(0.12, count / max);

        return (
            <div
                key={index}
                className="rounded border border-green-300/20 px-1.5 py-1 text-center"
                style={{ backgroundColor: `rgba(34,197,94,${opacity * 0.35})` }}
                title={`byte ${index}: ${count} changes`}
            >
                <div className="text-[9px] text-slate-500">B{index}</div>
                <div className="text-[11px] font-black text-green-100">{count}</div>
            </div>
        );
    });
}

function ReadinessPanel({
    readiness,
    activeModel,
    loading,
    onRefresh,
}: {
    readiness: MlReadiness | null;
    activeModel: MlModelSummary | null;
    loading: boolean;
    onRefresh: () => void;
}) {
    const counts = readiness?.counts ?? { positive: 0, negative: 0, uncertain: 0 };

    return (
        <div className="rounded-xl border border-purple-300/30 bg-purple-500/10 p-3 text-purple-100">
            <div className="mb-2 flex items-center justify-between gap-3">
                <div>
                    <p className="text-[10px] tracking-[0.25em] text-purple-200">SUPERVISED LEARNING</p>
                    <p className="text-sm font-black">MODEL READINESS</p>
                </div>
                <GameButton
                    onPress={onRefresh}
                    disabled={loading}
                    className="rounded-lg border border-purple-300/40 bg-purple-500/10 px-2 py-1 text-[10px] font-bold text-purple-100 hover:bg-purple-400/20 disabled:opacity-40"
                >
                    {loading ? "SYNCING" : "REFRESH"}
                </GameButton>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4 lg:grid-cols-7">
                <div className="rounded-lg border border-green-300/20 bg-black/20 p-2">
                    <p className="text-slate-500">positive</p>
                    <p className="text-xl font-black text-green-200">{counts.positive}</p>
                </div>
                <div className="rounded-lg border border-red-300/20 bg-black/20 p-2">
                    <p className="text-slate-500">negative</p>
                    <p className="text-xl font-black text-red-200">{counts.negative}</p>
                </div>
                <div className="rounded-lg border border-yellow-300/20 bg-black/20 p-2">
                    <p className="text-slate-500">uncertain</p>
                    <p className="text-xl font-black text-yellow-200">{counts.uncertain}</p>
                </div>
                <div className="rounded-lg border border-cyan-300/20 bg-black/20 p-2">
                    <p className="text-slate-500">sessions</p>
                    <p className="text-xl font-black text-cyan-200">{readiness?.distinct_sessions ?? 0}</p>
                </div>
                <div className="rounded-lg border border-slate-600 bg-black/20 p-2">
                    <p className="text-slate-500">ready</p>
                    <p className={`text-xl font-black ${readiness?.ready_to_train ? "text-green-200" : "text-slate-400"}`}>
                        {readiness?.ready_to_train ? "YES" : "NO"}
                    </p>
                </div>
                <div className="col-span-2 rounded-lg border border-slate-600 bg-black/20 p-2">
                    <p className="text-slate-500">active model</p>
                    <p className="truncate text-sm font-black text-purple-100">
                        {activeModel ? shortSessionId(activeModel.id) : "NONE"}
                    </p>
                    {activeModel && (
                        <p className="text-[10px] text-slate-500">
                            {activeModel.label_count ?? 0} labels · {activeModel.mission_code ?? "vehicle-wide"}
                        </p>
                    )}
                </div>
            </div>

            {!readiness?.ready_to_train && readiness?.missing && (
                <p className="mt-2 text-[10px] text-purple-100/70">
                    missing: {readiness.missing.total} total · {readiness.missing.positive} positive · {readiness.missing.negative} negative · {readiness.missing.distinct_sessions} sessions
                </p>
            )}
        </div>
    );
}

export function SignalReconBrainConsole({
    open,
    analyzing,
    error,
    analysis,
    logs,
    sessionId,
    missionCode,
    missionTitle,
    signalName,
    vehicleSlug,
    busInterface,
    busMode,
    sourceLabel,
    useLlm,
    useEmbeddings,
    autoAnalyze,
    mlLabels,
    mlReadiness,
    activeModel,
    mlLoading,
    labelingCandidateId,
    onClose,
    onAnalyze,
    onExplainWithLlm,
    onLoadLatest,
    onExportSession,
    onDeleteSession,
    onRefreshMl,
    onLabelCandidate,
    onValidateByteHypothesis,
    onToggleLlm,
    onToggleEmbeddings,
    onToggleAutoAnalyze,
}: SignalReconBrainConsoleProps) {
    const [activeTab, setActiveTab] = useState<BrainTab>("summary");
    const [notesByCandidate, setNotesByCandidate] = useState<Record<string, string>>({});
    const [sessionsByCandidate, setSessionsByCandidate] = useState<Record<string, string>>({});
    const [candidateFeedback, setCandidateFeedback] = useState<Record<string, CandidateSaveFeedback>>({});
    const [hypothesisFeedback, setHypothesisFeedback] = useState<Record<string, HypothesisSaveFeedback>>({});
    const [allIdSearch, setAllIdSearch] = useState("");
    const [localError, setLocalError] = useState<string | null>(null);

    const topCandidates = useMemo(
        () => [...(analysis?.candidates ?? [])].sort((a, b) => b.confidence - a.confidence).slice(0, 15),
        [analysis],
    );

    const topCandidate = topCandidates[0] ?? null;
    const allIdRows = useMemo(
        () => Object.entries(analysis?.heatmap ?? {}).sort(([, a], [, b]) =>
            (b.confidence ?? b.correlation_score ?? 0)
            - (a.confidence ?? a.correlation_score ?? 0)
            || b.change_count - a.change_count
            || a.can_id - b.can_id,
        ),
        [analysis],
    );

    const filteredAllIdRows = useMemo(() => {
        const query = allIdSearch.trim().toLowerCase();
        if (!query) return allIdRows;
        return allIdRows.filter(([canId, row]) =>
            canId.toLowerCase().includes(query)
            || String(row.can_id).includes(query)
            || String(row.candidate_role ?? "").toLowerCase().includes(query),
        );
    }, [allIdRows, allIdSearch]);

    const heatRows = useMemo(
        () => [...allIdRows]
            .sort(([, a], [, b]) => b.change_count - a.change_count)
            .slice(0, 16),
        [allIdRows],
    );

    const isBaselineProfile =
        analysis?.analysis_mode === "baseline_profile" ||
        analysis?.target_expected === false ||
        analysis?.baseline_profile?.target_expected === false;

    const resultModeLabel = isBaselineProfile ? "NOISE PROFILE" : "SIGNAL HYPOTHESIS";

    const submitLabel = async (
        candidate: CandidateLabelTarget,
        label: CandidateMlLabelValue,
    ) => {
        const labelKey = String(candidate.can_id);
        const draftKey = `${sessionId ?? "no-session"}:${candidate.can_id}`;
        const existingMetadata = mlLabels[labelKey]?.metadata;
        const storedIndependentSessions =
            existingMetadata && typeof existingMetadata.independent_sessions === "number"
                ? existingMetadata.independent_sessions
                : 1;

        const notes = notesByCandidate[draftKey] ?? mlLabels[labelKey]?.notes ?? "";
        const independentSessions = Math.max(
            1,
            Number.parseInt(
                sessionsByCandidate[draftKey] ?? String(storedIndependentSessions),
                10,
            ) || 1,
        );

        setLocalError(null);
        setCandidateFeedback((current) => ({
            ...current,
            [draftKey]: { label, state: "saving" },
        }));

        const saved = await onLabelCandidate(
            candidate,
            label,
            notes,
            label === "positive"
                ? {
                    validation_method: "controlled_session_review",
                    independent_sessions: independentSessions,
                }
                : {},
        );

        setCandidateFeedback((current) => ({
            ...current,
            [draftKey]: { label, state: saved ? "saved" : "error" },
        }));
    };

    const hypothesisReviewKey = (
        candidate: BrainCandidate,
        hypothesis: ByteRoleHypothesis,
    ) => [
        sessionId ?? "no-session",
        candidate.can_id,
        hypothesis.byte_index,
        hypothesis.bit_mask ?? 0,
        hypothesis.hypothesis_kind,
    ].join(":");

    const submitHypothesisValidation = async (
        candidate: BrainCandidate,
        hypothesis: ByteRoleHypothesis,
        validationStatus: "positive" | "negative" | "uncertain",
    ) => {
        const key = hypothesisReviewKey(candidate, hypothesis);
        setLocalError(null);
        setHypothesisFeedback((current) => ({
            ...current,
            [key]: { validationStatus, state: "saving" },
        }));

        const saved = await onValidateByteHypothesis(
            candidate,
            hypothesis,
            validationStatus,
        );

        setHypothesisFeedback((current) => ({
            ...current,
            [key]: {
                validationStatus,
                state: saved ? "saved" : "error",
            },
        }));
    };

    if (!open) return null;

    return (
        <div className="absolute inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm">
            <div className="flex h-[92dvh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-green-300/30 bg-slate-950/95 font-mono text-green-100 shadow-2xl shadow-green-500/10 sm:h-[84dvh]">
                <div className="shrink-0 border-b border-green-400/20 px-3 py-2">
                    <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                            <p className="text-[10px] tracking-[0.32em] text-yellow-300 sm:text-xs">AVENLAB // PI BRAIN</p>
                            <h2 className="truncate text-lg font-black text-green-100 sm:text-2xl">{resultModeLabel}</h2>
                            <p className="truncate text-[11px] text-slate-400 sm:text-xs">
                                {missionCode} · {missionTitle} · {signalName} · {vehicleSlug} · {busInterface}/{sourceLabel || busMode} · {shortSessionId(sessionId)}
                            </p>
                        </div>

                        <div className="flex shrink-0 flex-wrap justify-end gap-1">
                            <GameButton onPress={onAnalyze} disabled={analyzing || !sessionId} className="rounded-lg border border-yellow-300/40 bg-yellow-500/10 px-2 py-1 text-[10px] font-bold text-yellow-100 hover:bg-yellow-400/20 disabled:opacity-40">
                                {analyzing ? "ANALYZING" : "QUICK ID"}
                            </GameButton>
                            <GameButton onPress={() => { setActiveTab("llm"); onExplainWithLlm(); }} disabled={analyzing || !sessionId} className="rounded-lg border border-purple-300/40 bg-purple-500/10 px-2 py-1 text-[10px] font-bold text-purple-100 hover:bg-purple-400/20 disabled:opacity-40">
                                EXPLAIN
                            </GameButton>
                            <GameButton onPress={onLoadLatest} disabled={analyzing || !sessionId} className="rounded-lg border border-cyan-300/40 bg-cyan-500/10 px-2 py-1 text-[10px] font-bold text-cyan-100 hover:bg-cyan-400/20 disabled:opacity-40">READ DB</GameButton>
                            <GameButton onPress={onExportSession} disabled={analyzing || !sessionId} className="rounded-lg border border-cyan-300/40 bg-cyan-500/10 px-2 py-1 text-[10px] font-bold text-cyan-100 hover:bg-cyan-400/20 disabled:opacity-40">EXPORT</GameButton>
                            <GameButton onPress={onDeleteSession} disabled={analyzing || !sessionId} className="rounded-lg border border-red-300/40 bg-red-500/10 px-2 py-1 text-[10px] font-bold text-red-100 hover:bg-red-400/20 disabled:opacity-40">DELETE</GameButton>
                            <GameButton onPress={onToggleLlm} disabled={analyzing} className={`rounded-lg border px-2 py-1 text-[10px] font-bold ${useLlm ? "border-green-300/40 bg-green-500/10 text-green-100" : "border-slate-600 bg-slate-900 text-slate-400"}`}>LLM {useLlm ? "ON" : "OFF"}</GameButton>
                            <GameButton onPress={onToggleEmbeddings} disabled={analyzing} className={`rounded-lg border px-2 py-1 text-[10px] font-bold ${useEmbeddings ? "border-cyan-300/40 bg-cyan-500/10 text-cyan-100" : "border-slate-600 bg-slate-900 text-slate-400"}`}>MEM {useEmbeddings ? "ON" : "OFF"}</GameButton>
                            <GameButton onPress={onToggleAutoAnalyze} disabled={analyzing} className={`rounded-lg border px-2 py-1 text-[10px] font-bold ${autoAnalyze ? "border-cyan-300/40 bg-cyan-500/10 text-cyan-100" : "border-slate-600 bg-slate-900 text-slate-400"}`}>AUTO {autoAnalyze ? "ON" : "OFF"}</GameButton>
                            <GameButton onPress={onClose} className="rounded-lg border border-slate-600 bg-slate-900 px-2 py-1 text-[10px] font-bold text-slate-100 hover:bg-slate-800">CLOSE</GameButton>
                        </div>
                    </div>

                    <div className="mt-2 flex gap-1 overflow-x-auto pb-1">
                        {TABS.map((tab) => (
                            <GameButton key={tab.id} onPress={() => setActiveTab(tab.id)} className={`shrink-0 rounded-lg border px-2 py-1 text-[10px] font-bold transition sm:text-xs ${activeTab === tab.id ? "border-green-300 bg-green-500/20 text-green-100" : "border-slate-700 bg-slate-900 text-slate-400 hover:bg-slate-800"}`}>
                                {tab.label}
                            </GameButton>
                        ))}
                    </div>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto p-3">
                    {(error || localError) && (
                        <div className="mb-3 rounded-xl border border-red-300/40 bg-red-500/10 p-3 text-sm text-red-100">{localError ?? error}</div>
                    )}
                    {analyzing && (
                        <div className="mb-3 rounded-xl border border-yellow-300/40 bg-yellow-500/10 p-3 text-sm text-yellow-100">&gt; analyzing CAN evidence and model context...</div>
                    )}

                    {activeTab === "summary" && (
                        <div className="space-y-3">
                            <ReadinessPanel readiness={mlReadiness} activeModel={activeModel} loading={mlLoading} onRefresh={onRefreshMl} />

                            <div className="rounded-xl border border-cyan-300/30 bg-cyan-500/10 p-3 text-cyan-100">
                                <div className="flex flex-wrap items-center justify-between gap-3">
                                    <div>
                                        <p className="text-[10px] tracking-[0.24em] text-cyan-200">VECTOR MEMORY</p>
                                        <p className="text-sm font-black">
                                            {analysis?.vector_memory?.retrieved
                                                ? `${analysis.vector_memory.match_count ?? 0} HISTORICAL MATCHES`
                                                : analysis?.vector_memory?.query_embedded
                                                    ? "NO COMPATIBLE MATCHES"
                                                    : "MEMORY NOT QUERIED"}
                                        </p>
                                    </div>
                                    <div className="grid grid-cols-3 gap-2 text-center text-[10px]">
                                        <div className="rounded-lg border border-cyan-300/20 bg-black/20 px-2 py-1">
                                            <p className="text-slate-500">query</p>
                                            <p className="font-black">{analysis?.vector_memory?.query_embedded ? "YES" : "NO"}</p>
                                        </div>
                                        <div className="rounded-lg border border-cyan-300/20 bg-black/20 px-2 py-1">
                                            <p className="text-slate-500">matches</p>
                                            <p className="font-black">{analysis?.vector_memory?.match_count ?? 0}</p>
                                        </div>
                                        <div className="rounded-lg border border-cyan-300/20 bg-black/20 px-2 py-1">
                                            <p className="text-slate-500">stored</p>
                                            <p className="font-black">{analysis?.vector_memory?.stored ? "YES" : "—"}</p>
                                        </div>
                                    </div>
                                </div>
                                <p className="mt-2 text-[10px] text-cyan-100/70">
                                    Same vehicle, mission, capture kind, analysis mode, and embedding model. Historical memory does not directly alter the evidence score.
                                </p>
                                {(analysis?.vector_memory?.error || analysis?.vector_memory?.storage_error) && (
                                    <p className="mt-1 text-[10px] text-red-200">
                                        {analysis.vector_memory.error ?? analysis.vector_memory.storage_error}
                                    </p>
                                )}
                            </div>

                            <div className="rounded-xl border border-green-400/20 bg-slate-900/80 p-4">
                                <p className="text-xs text-yellow-300">{resultModeLabel}</p>
                                {isBaselineProfile ? (
                                    <div className="mt-2 grid gap-3 sm:grid-cols-[0.75fr_1.25fr]">
                                        <div className="rounded-xl border border-cyan-300/40 bg-cyan-500/10 p-4 text-cyan-100">
                                            <p className="text-4xl font-black">{analysis?.baseline_profile?.observed_ids ?? Object.keys(analysis?.heatmap ?? {}).length}</p>
                                            <p className="text-sm">observed CAN IDs</p>
                                            <p className="mt-3 text-2xl font-black">BASELINE</p>
                                        </div>
                                        <div className="space-y-2 text-sm text-slate-300">
                                            <p>No target ID expected for this mission.</p>
                                            <p>Use this profile to filter normal traffic during action missions.</p>
                                            <p className="text-cyan-200">{analysis?.baseline_profile?.guidance ?? "Background traffic profile captured."}</p>
                                        </div>
                                    </div>
                                ) : topCandidate ? (
                                    <div className="mt-2 grid gap-3 sm:grid-cols-[0.7fr_1.3fr]">
                                        <div className={`rounded-xl border p-4 ${candidateTone(topCandidate.confidence)}`}>
                                            <p className="text-4xl font-black">{percent(topCandidate.confidence)}</p>
                                            <p className="text-sm">final evidence score</p>
                                            <p className="mt-3 text-2xl font-black">{topCandidate.can_id_hex}</p>
                                            {topCandidate.field_hypotheses?.[0] ? (
                                                <p className="mt-1 text-sm font-black text-cyan-200">
                                                    B{topCandidate.field_hypotheses[0].start_byte} · {topCandidate.field_hypotheses[0].width_bits}-bit · {topCandidate.field_hypotheses[0].endianness}{topCandidate.field_hypotheses[0].signed ? " signed" : ""}
                                                </p>
                                            ) : topCandidate.signal_hypotheses?.[0] ? (
                                                <p className="mt-1 text-sm font-black text-cyan-200">
                                                    B{topCandidate.signal_hypotheses[0].byte_index} · bit {topCandidate.signal_hypotheses[0].bit_index} · {formatMask(topCandidate.signal_hypotheses[0].bit_mask)}
                                                </p>
                                            ) : null}
                                        </div>
                                        <div className="grid gap-2 text-sm text-slate-300 sm:grid-cols-2">
                                            <p><span className="text-slate-500">statistical evidence:</span> {percent(topCandidate.confidence_before_baseline)}</p>
                                            <p><span className="text-slate-500">baseline-adjusted evidence:</span> {percent(topCandidate.confidence_before_ml ?? topCandidate.confidence)}</p>
                                            <p><span className="text-slate-500">ML probability:</span> {percent(topCandidate.ml_probability)}</p>
                                            <p><span className="text-slate-500">marker score:</span> {fixed(topCandidate.correlation_score)}</p>
                                            <p><span className="text-slate-500">frames:</span> {topCandidate.frame_count}</p>
                                            <p><span className="text-slate-500">aggregate ID changes:</span> {topCandidate.change_count}</p>
                                            {topCandidate.signal_hypotheses?.[0] && (
                                                <>
                                                    <p><span className="text-slate-500">matched actions:</span> {topCandidate.signal_hypotheses[0].matched_repetitions}/{topCandidate.signal_hypotheses[0].total_repetitions}</p>
                                                    <p><span className="text-slate-500">outside-action flips:</span> {topCandidate.signal_hypotheses[0].out_of_window_flips}</p>
                                                </>
                                            )}
                                            <p className="sm:col-span-2 text-cyan-200">{topCandidate.notes}</p>
                                        </div>
                                    </div>
                                ) : (
                                    <p className="mt-2 text-sm text-slate-500">No candidates yet. Select a session and analyze it.</p>
                                )}
                            </div>

                            <div className="rounded-xl border border-cyan-300/20 bg-cyan-500/5 p-3 text-xs text-cyan-100">
                                <div className="grid gap-2 sm:grid-cols-3">
                                    <div>
                                        <p className="text-slate-500">Evidence semantics</p>
                                        <p className="font-bold">
                                            {analysis?.confidence_semantics ??
                                                "Research evidence score in [0,1], not a calibrated probability."}
                                        </p>
                                    </div>
                                    <div>
                                        <p className="text-slate-500">Correlation markers</p>
                                        <p className="font-bold">
                                            {analysis?.selected_action_markers ??
                                                analysis?.marker_selection?.action_markers ??
                                                0} action / {analysis?.markers ?? 0} total
                                        </p>
                                        <p className="text-[10px] text-slate-500">
                                            {analysis?.marker_selection?.strategy ?? "explicit action markers only"}
                                        </p>
                                    </div>
                                    <div>
                                        <p className="text-slate-500">Frame selection</p>
                                        <p className="font-bold">
                                            {analysis?.frames_analyzed ?? 0} / {analysis?.frames_available ??
                                                analysis?.frame_selection?.total_frames ??
                                                analysis?.frames_analyzed ??
                                                0}
                                        </p>
                                        <p className="text-[10px] text-slate-500">
                                            {analysis?.frame_selection?.strategy ?? "all_frames"}
                                        </p>
                                    </div>
                                </div>
                                {analysis?.frame_selection?.warning && (
                                    <p className="mt-2 rounded-lg border border-yellow-300/20 bg-yellow-500/10 p-2 text-yellow-100">
                                        {analysis.frame_selection.warning}
                                    </p>
                                )}
                            </div>

                            <div className="grid gap-2 text-sm sm:grid-cols-4">
                                <div className="rounded-xl border border-green-400/20 bg-slate-900/80 p-3"><p className="text-slate-500">frames</p><p className="text-2xl font-black">{analysis?.frames_analyzed ?? 0}</p></div>
                                <div className="rounded-xl border border-green-400/20 bg-slate-900/80 p-3"><p className="text-slate-500">markers</p><p className="text-2xl font-black">{analysis?.markers ?? 0}</p></div>
                                <div className="rounded-xl border border-green-400/20 bg-slate-900/80 p-3"><p className="text-slate-500">mode</p><p className="text-lg font-black">{busMode.toUpperCase()}</p></div>
                                <div className="rounded-xl border border-green-400/20 bg-slate-900/80 p-3"><p className="text-slate-500">LLM</p><p className="text-2xl font-black">{analysis?.llm_available ? "ON" : "OFF"}</p></div>
                            </div>
                        </div>
                    )}

                    {activeTab === "candidates" && (
                        <div className="space-y-3">
                            <ReadinessPanel readiness={mlReadiness} activeModel={activeModel} loading={mlLoading} onRefresh={onRefreshMl} />

                            {topCandidates.map((candidate) => {
                                const labelKey = String(candidate.can_id);
                                const draftKey = `${sessionId ?? "no-session"}:${candidate.can_id}`;
                                const existingLabel = mlLabels[labelKey];
                                const saveFeedback = candidateFeedback[draftKey];
                                const effectiveLabel = saveFeedback?.state !== "error"
                                    ? saveFeedback?.label ?? existingLabel?.label
                                    : existingLabel?.label;
                                const statisticalConfidence = candidate.confidence_before_baseline ?? candidate.confidence_before_ml ?? candidate.confidence;
                                const baselineAdjustedConfidence = candidate.confidence_before_ml ?? candidate.confidence;
                                const topBitSignal = candidate.signal_hypotheses?.[0] ?? null;
                                const topFieldSignal = candidate.field_hypotheses?.[0] ?? null;
                                const fieldReview: ByteRoleHypothesis | null = topFieldSignal
                                    ? {
                                        byte_index: topFieldSignal.start_byte,
                                        hypothesis_kind: "numeric_field_candidate",
                                        confidence: topFieldSignal.score,
                                        bit_mask: null,
                                        reason: topFieldSignal.reason,
                                        metrics: { ...topFieldSignal },
                                    }
                                    : null;
                                const bitReview: ByteRoleHypothesis | null = topBitSignal
                                    ? {
                                        byte_index: topBitSignal.byte_index,
                                        hypothesis_kind: "boolean_signal_candidate",
                                        confidence: topBitSignal.score,
                                        bit_mask: topBitSignal.bit_mask,
                                        reason: topBitSignal.reason,
                                        metrics: { ...topBitSignal },
                                    }
                                    : null;
                                const fieldFeedback = fieldReview
                                    ? hypothesisFeedback[hypothesisReviewKey(candidate, fieldReview)]
                                    : undefined;
                                const bitFeedback = bitReview
                                    ? hypothesisFeedback[hypothesisReviewKey(candidate, bitReview)]
                                    : undefined;
                                const fieldStatus = fieldFeedback?.state !== "error"
                                    ? fieldFeedback?.validationStatus
                                    : undefined;
                                const bitStatus = bitFeedback?.state !== "error"
                                    ? bitFeedback?.validationStatus
                                    : undefined;
                                const saving = labelingCandidateId === candidate.can_id
                                    || saveFeedback?.state === "saving";

                                return (
                                    <div key={candidate.can_id_hex} className={`rounded-xl border p-3 ${candidateTone(candidate.confidence)}`}>
                                        <div className="flex flex-wrap items-start justify-between gap-3">
                                            <div>
                                                <p className="text-xl font-black">{candidate.can_id_hex}</p>
                                                <p className="text-xs text-slate-500">
                                                    decimal {candidate.can_id} · {candidate.frame_count} frames · {candidate.change_count} aggregate ID changes
                                                </p>
                                                {topBitSignal && (
                                                    <p className="mt-1 text-xs font-black text-cyan-200">
                                                        QUICK ID: B{topBitSignal.byte_index} bit {topBitSignal.bit_index} ({formatMask(topBitSignal.bit_mask)})
                                                    </p>
                                                )}
                                            </div>
                                            <span className={`rounded-lg border px-2 py-1 text-[10px] font-black ${labelTone(effectiveLabel)}`}>
                                                {saveFeedback?.state === "saving"
                                                    ? "SAVING LABEL…"
                                                    : saveFeedback?.state === "saved"
                                                        ? `✓ ${labelText(effectiveLabel)} SAVED`
                                                        : labelText(effectiveLabel)}
                                            </span>
                                        </div>

                                        <div className="mt-3 grid grid-cols-2 gap-2 text-xs lg:grid-cols-4">
                                            <div className="rounded-lg border border-slate-700 bg-black/20 p-2"><p className="text-slate-500">Statistical evidence</p><p className="text-lg font-black">{percent(statisticalConfidence)}</p></div>
                                            <div className="rounded-lg border border-slate-700 bg-black/20 p-2"><p className="text-slate-500">Baseline-adjusted evidence</p><p className="text-lg font-black">{percent(baselineAdjustedConfidence)}</p></div>
                                            <div className="rounded-lg border border-slate-700 bg-black/20 p-2"><p className="text-slate-500">ML probability</p><p className="text-lg font-black">{percent(candidate.ml_probability)}</p></div>
                                            <div className="rounded-lg border border-slate-700 bg-black/20 p-2"><p className="text-slate-500">Final evidence score</p><p className="text-lg font-black">{percent(candidate.confidence)}</p></div>
                                        </div>

                                        {topFieldSignal && (
                                            <div className="mt-3 rounded-lg border border-purple-300/30 bg-purple-500/5 p-3 text-xs">
                                                <div className="flex flex-wrap items-center justify-between gap-2">
                                                    <div>
                                                        <p className="text-[10px] tracking-[0.18em] text-purple-300">FIELD-FIRST QUICK ID</p>
                                                        <p className="text-lg font-black text-purple-100">
                                                            {candidate.can_id_hex} / B{topFieldSignal.start_byte} / {topFieldSignal.width_bits}-bit {topFieldSignal.endianness}{topFieldSignal.signed ? " signed" : ""}
                                                        </p>
                                                    </div>
                                                    <div className="text-right">
                                                        <p className="text-2xl font-black text-purple-100">{percent(topFieldSignal.baseline_adjusted_score ?? topFieldSignal.score)}</p>
                                                        <p className="text-[10px] text-slate-500">exact-field evidence</p>
                                                    </div>
                                                </div>

                                                <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-5">
                                                    <div><p className="text-slate-500">monotonicity</p><p className="font-black">{percent(topFieldSignal.monotonicity)}</p></div>
                                                    <div><p className="text-slate-500">level separation</p><p className="font-black">{percent(topFieldSignal.level_separation)}</p></div>
                                                    <div><p className="text-slate-500">repeatability</p><p className="font-black">{percent(topFieldSignal.repeatability)}</p></div>
                                                    <div><p className="text-slate-500">plateau stability</p><p className="font-black">{percent(topFieldSignal.plateau_stability)}</p></div>
                                                    <div><p className="text-slate-500">outside drift</p><p className={`font-black ${topFieldSignal.outside_action_drift <= 0.1 ? "text-green-200" : "text-red-200"}`}>{percent(topFieldSignal.outside_action_drift)}</p></div>
                                                </div>

                                                <div className="mt-2 overflow-x-auto rounded border border-slate-700 bg-black/20 p-2">
                                                    <table className="w-full min-w-[420px] text-left text-[10px]">
                                                        <thead className="text-slate-500">
                                                            <tr><th>expected</th><th>observed median</th><th>unit</th></tr>
                                                        </thead>
                                                        <tbody>
                                                            {topFieldSignal.expected_levels.map((level) => (
                                                                <tr key={level} className="border-t border-slate-800">
                                                                    <td>{level}</td>
                                                                    <td className="font-black text-purple-100">{fixed(topFieldSignal.observed_level_medians[String(level)], 2)}</td>
                                                                    <td>{topFieldSignal.observations.find((item) => item.expected_value === level)?.expected_unit ?? "raw"}</td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </div>

                                                {fieldReview && (
                                                    <div className={`mt-2 rounded border px-2 py-1 text-[10px] font-black ${labelTone(fieldStatus)}`}>
                                                        {fieldFeedback?.state === "saving"
                                                            ? "SAVING FIELD REVIEW…"
                                                            : fieldFeedback?.state === "saved"
                                                                ? `✓ ${labelText(fieldStatus)} SAVED`
                                                                : fieldStatus
                                                                    ? labelText(fieldStatus)
                                                                    : "FIELD UNREVIEWED"}
                                                    </div>
                                                )}
                                                <div className="mt-2 grid grid-cols-3 gap-2">
                                                    <GameButton
                                                        onPress={() => fieldReview && void submitHypothesisValidation(candidate, fieldReview, "positive")}
                                                        disabled={!fieldReview || fieldFeedback?.state === "saving"}
                                                        className={`rounded border px-2 py-1 text-[10px] disabled:opacity-40 ${fieldStatus === "positive" ? "border-green-200 bg-green-500/30 text-green-50 ring-1 ring-green-300" : "border-green-300/30 text-green-200"}`}
                                                    >
                                                        {fieldStatus === "positive" ? "✓ FIELD CONFIRMED" : "CONFIRM FIELD"}
                                                    </GameButton>
                                                    <GameButton
                                                        onPress={() => fieldReview && void submitHypothesisValidation(candidate, fieldReview, "negative")}
                                                        disabled={!fieldReview || fieldFeedback?.state === "saving"}
                                                        className={`rounded border px-2 py-1 text-[10px] disabled:opacity-40 ${fieldStatus === "negative" ? "border-red-200 bg-red-500/30 text-red-50 ring-1 ring-red-300" : "border-red-300/30 text-red-200"}`}
                                                    >
                                                        {fieldStatus === "negative" ? "✓ FIELD REJECTED" : "REJECT FIELD"}
                                                    </GameButton>
                                                    <GameButton
                                                        onPress={() => fieldReview && void submitHypothesisValidation(candidate, fieldReview, "uncertain")}
                                                        disabled={!fieldReview || fieldFeedback?.state === "saving"}
                                                        className={`rounded border px-2 py-1 text-[10px] disabled:opacity-40 ${fieldStatus === "uncertain" ? "border-yellow-200 bg-yellow-500/30 text-yellow-50 ring-1 ring-yellow-300" : "border-yellow-300/30 text-yellow-200"}`}
                                                    >
                                                        {fieldStatus === "uncertain" ? "✓ FIELD UNSURE" : "UNSURE"}
                                                    </GameButton>
                                                </div>
                                            </div>
                                        )}

                                        {topBitSignal && (
                                            <div className="mt-3 rounded-lg border border-cyan-300/30 bg-cyan-500/5 p-3 text-xs">
                                                <div className="flex flex-wrap items-center justify-between gap-2">
                                                    <div>
                                                        <p className="text-[10px] tracking-[0.18em] text-cyan-300">
                                                            {candidate.quick_id_method === "bit_first_opposing_actions"
                                                                ? "BIT-FIRST QUICK ID"
                                                                : "SECONDARY BIT THRESHOLD"}
                                                        </p>
                                                        <p className="text-lg font-black text-cyan-100">
                                                            {candidate.can_id_hex} / B{topBitSignal.byte_index} / bit {topBitSignal.bit_index}
                                                        </p>
                                                    </div>
                                                    <div className="text-right">
                                                        <p className="text-2xl font-black text-cyan-100">{percent(topBitSignal.baseline_adjusted_score ?? topBitSignal.score)}</p>
                                                        <p className="text-[10px] text-slate-500">exact-location evidence</p>
                                                    </div>
                                                </div>

                                                <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-5">
                                                    <div><p className="text-slate-500">matched</p><p className="font-black">{topBitSignal.matched_repetitions}/{topBitSignal.total_repetitions}</p></div>
                                                    <div><p className="text-slate-500">inside flips</p><p className="font-black">{topBitSignal.in_window_flips}</p></div>
                                                    <div><p className="text-slate-500">outside flips</p><p className={`font-black ${topBitSignal.out_of_window_flips === 0 ? "text-green-200" : "text-red-200"}`}>{topBitSignal.out_of_window_flips}</p></div>
                                                    <div><p className="text-slate-500">window purity</p><p className="font-black">{percent(topBitSignal.window_purity)}</p></div>
                                                    <div><p className="text-slate-500">inverse ON/OFF</p><p className={`font-black ${topBitSignal.inverse_pair_verified ? "text-green-200" : "text-yellow-200"}`}>{topBitSignal.inverse_pair_verified ? "YES" : "NO"}</p></div>
                                                </div>

                                                <div className="mt-2 grid gap-1 sm:grid-cols-2">
                                                    {Object.entries(topBitSignal.action_groups).map(([actionKey, group]) => (
                                                        <div key={actionKey} className="rounded border border-slate-700 bg-black/20 p-2">
                                                            <div className="flex items-center justify-between gap-2">
                                                                <span className="font-black">{actionKey}</span>
                                                                <span className="text-cyan-200">{stateTransition(group)}</span>
                                                            </div>
                                                            <p className="text-[10px] text-slate-500">
                                                                {group.matched_repetitions ?? 0}/{group.repetitions ?? 0} matched · flips {(group.flip_counts ?? []).join(", ") || "none"}
                                                            </p>
                                                        </div>
                                                    ))}
                                                </div>

                                                {bitReview && (
                                                    <div className={`mt-2 rounded border px-2 py-1 text-[10px] font-black ${labelTone(bitStatus)}`}>
                                                        {bitFeedback?.state === "saving"
                                                            ? "SAVING BIT REVIEW…"
                                                            : bitFeedback?.state === "saved"
                                                                ? `✓ ${labelText(bitStatus)} SAVED`
                                                                : bitStatus
                                                                    ? labelText(bitStatus)
                                                                    : "BIT UNREVIEWED"}
                                                    </div>
                                                )}
                                                <div className="mt-2 grid grid-cols-3 gap-2">
                                                    <GameButton
                                                        onPress={() => bitReview && void submitHypothesisValidation(candidate, bitReview, "positive")}
                                                        disabled={!bitReview || bitFeedback?.state === "saving"}
                                                        className={`rounded border px-2 py-1 text-[10px] disabled:opacity-40 ${bitStatus === "positive" ? "border-green-200 bg-green-500/30 text-green-50 ring-1 ring-green-300" : "border-green-300/30 text-green-200"}`}
                                                    >
                                                        {bitStatus === "positive" ? "✓ BIT CONFIRMED" : "CONFIRM BIT"}
                                                    </GameButton>
                                                    <GameButton
                                                        onPress={() => bitReview && void submitHypothesisValidation(candidate, bitReview, "negative")}
                                                        disabled={!bitReview || bitFeedback?.state === "saving"}
                                                        className={`rounded border px-2 py-1 text-[10px] disabled:opacity-40 ${bitStatus === "negative" ? "border-red-200 bg-red-500/30 text-red-50 ring-1 ring-red-300" : "border-red-300/30 text-red-200"}`}
                                                    >
                                                        {bitStatus === "negative" ? "✓ BIT REJECTED" : "REJECT BIT"}
                                                    </GameButton>
                                                    <GameButton
                                                        onPress={() => bitReview && void submitHypothesisValidation(candidate, bitReview, "uncertain")}
                                                        disabled={!bitReview || bitFeedback?.state === "saving"}
                                                        className={`rounded border px-2 py-1 text-[10px] disabled:opacity-40 ${bitStatus === "uncertain" ? "border-yellow-200 bg-yellow-500/30 text-yellow-50 ring-1 ring-yellow-300" : "border-yellow-300/30 text-yellow-200"}`}
                                                    >
                                                        {bitStatus === "uncertain" ? "✓ BIT UNSURE" : "UNSURE"}
                                                    </GameButton>
                                                </div>
                                            </div>
                                        )}

                                        {candidate.historical_support && (
                                            <div className="mt-3 grid grid-cols-2 gap-2 rounded-lg border border-cyan-300/20 bg-cyan-500/5 p-2 text-xs sm:grid-cols-4">
                                                <div>
                                                    <p className="text-slate-500">Historical sessions</p>
                                                    <p className="font-black text-cyan-100">
                                                        {candidate.historical_support.seen_sessions ?? 0}/{candidate.historical_support.retrieved_sessions ?? 0}
                                                    </p>
                                                </div>
                                                <div>
                                                    <p className="text-slate-500">Top-five repeats</p>
                                                    <p className="font-black text-cyan-100">{candidate.historical_support.top_five_sessions ?? 0}</p>
                                                </div>
                                                <div>
                                                    <p className="text-slate-500">Same active bytes</p>
                                                    <p className="font-black text-cyan-100">{candidate.historical_support.same_active_bytes_sessions ?? 0}</p>
                                                </div>
                                                <div>
                                                    <p className="text-slate-500">Mean similarity</p>
                                                    <p className="font-black text-cyan-100">{percent(candidate.historical_support.mean_similarity)}</p>
                                                </div>
                                            </div>
                                        )}

                                        <div className="mt-3 grid grid-cols-8 gap-1">{byteCells(candidate.byte_change_counts)}</div>

                                        {Boolean(candidate.byte_role_hypotheses?.length) && (
                                            <div className="mt-3 rounded-lg border border-cyan-300/20 bg-black/20 p-2">
                                                <p className="mb-2 text-[10px] tracking-[0.18em] text-cyan-300">AUTO BYTE ROLES</p>
                                                <div className="grid gap-1 sm:grid-cols-2 lg:grid-cols-4">
                                                    {candidate.byte_role_hypotheses?.map((hypothesis) => (
                                                        <div
                                                            key={`${candidate.can_id}:${hypothesis.byte_index}:${hypothesis.hypothesis_kind}`}
                                                            className={`rounded-lg border p-2 text-[10px] ${hypothesisTone(hypothesis.hypothesis_kind)}`}
                                                            title={hypothesis.reason}
                                                        >
                                                            <div className="flex items-center justify-between gap-2">
                                                                <span className="font-black">B{hypothesis.byte_index}</span>
                                                                <span>{percent(hypothesis.confidence)}</span>
                                                            </div>
                                                            <p className="mt-1 break-words font-bold">{hypothesis.hypothesis_kind.replace(/_/g, " ").toUpperCase()}</p>
                                                            <p className="mt-1 text-slate-500">mask {formatMask(hypothesis.bit_mask)}</p>
                                                            <p className="mt-1 font-black">
                                                                {hypothesisFeedback[hypothesisReviewKey(candidate, hypothesis)]?.state === "saving"
                                                                    ? "SAVING REVIEW…"
                                                                    : hypothesisFeedback[hypothesisReviewKey(candidate, hypothesis)]?.state === "saved"
                                                                        ? `✓ ${hypothesisFeedback[hypothesisReviewKey(candidate, hypothesis)]?.validationStatus.toUpperCase()} SAVED`
                                                                        : hypothesis.validation_status && hypothesis.validation_status !== "unreviewed"
                                                                            ? hypothesis.validation_status.toUpperCase()
                                                                            : "UNREVIEWED"}
                                                            </p>
                                                            <div className="mt-2 grid grid-cols-3 gap-1">
                                                                <GameButton
                                                                    onPress={() => void submitHypothesisValidation(candidate, hypothesis, "positive")}
                                                                    className="rounded border border-green-300/30 px-1 py-0.5 text-[9px] text-green-200"
                                                                >
                                                                    CONFIRM
                                                                </GameButton>
                                                                <GameButton
                                                                    onPress={() => void submitHypothesisValidation(candidate, hypothesis, "negative")}
                                                                    className="rounded border border-red-300/30 px-1 py-0.5 text-[9px] text-red-200"
                                                                >
                                                                    REJECT
                                                                </GameButton>
                                                                <GameButton
                                                                    onPress={() => void submitHypothesisValidation(candidate, hypothesis, "uncertain")}
                                                                    className="rounded border border-yellow-300/30 px-1 py-0.5 text-[9px] text-yellow-200"
                                                                >
                                                                    UNSURE
                                                                </GameButton>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                                <p className="mt-2 text-[10px] text-slate-500">Checksum labels are conservative candidates, not confirmed algorithms.</p>
                                            </div>
                                        )}

                                        <div className="mt-3 grid gap-2 lg:grid-cols-[1fr_180px]">
                                            <label className="block">
                                                <span className="text-[10px] tracking-[0.18em] text-slate-500">VALIDATION NOTES</span>
                                                <textarea
                                                    value={notesByCandidate[draftKey] ?? existingLabel?.notes ?? ""}
                                                    onChange={(event) =>
                                                        setNotesByCandidate((current) => ({
                                                            ...current,
                                                            [draftKey]: event.target.value,
                                                        }))
                                                    }
                                                    placeholder="Record why this candidate is relevant, background, or still uncertain."
                                                    className="mt-1 min-h-20 w-full rounded-lg border border-slate-700 bg-slate-950 p-2 text-xs text-slate-200 outline-none focus:border-green-300"
                                                />
                                            </label>
                                            <label className="block">
                                                <span className="text-[10px] tracking-[0.18em] text-slate-500">INDEPENDENT SESSIONS</span>
                                                <input
                                                    type="number"
                                                    min={1}
                                                    value={sessionsByCandidate[draftKey] ?? "1"}
                                                    onChange={(event) =>
                                                        setSessionsByCandidate((current) => ({
                                                            ...current,
                                                            [draftKey]: event.target.value,
                                                        }))
                                                    }
                                                    placeholder="required for relevant"
                                                    className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 p-2 text-xs text-slate-200 outline-none focus:border-green-300"
                                                />
                                                <p className="mt-2 text-[10px] text-slate-500">Start at 1 controlled session. More independent sessions improve confidence and cross-validation.</p>
                                            </label>
                                        </div>

                                        {existingLabel?.notes && (
                                            <div className="mt-2 rounded-lg border border-slate-700 bg-black/20 p-2 text-xs text-slate-400">
                                                <span className="text-slate-500">Existing label notes:</span> {existingLabel.notes}
                                            </div>
                                        )}

                                        {saveFeedback?.state === "error" && (
                                            <p className="mt-2 rounded border border-red-300/40 bg-red-500/10 px-2 py-1 text-[10px] text-red-100">
                                                Label was not saved. Review the error above and try again.
                                            </p>
                                        )}

                                        <div className="mt-3 grid gap-2 sm:grid-cols-3">
                                            <GameButton
                                                onPress={() => void submitLabel(candidate, "positive")}
                                                disabled={saving || analyzing}
                                                className={`rounded-lg border px-3 py-2 text-xs font-bold disabled:opacity-40 ${effectiveLabel === "positive" ? "border-green-200 bg-green-500/30 text-green-50 ring-1 ring-green-300" : "border-green-300/40 bg-green-500/10 text-green-100 hover:bg-green-400/20"}`}
                                            >
                                                {saving && saveFeedback?.label === "positive" ? "SAVING…" : effectiveLabel === "positive" ? "✓ VALIDATED RELEVANT" : "VALIDATED RELEVANT"}
                                            </GameButton>
                                            <GameButton
                                                onPress={() => void submitLabel(candidate, "negative")}
                                                disabled={saving || analyzing}
                                                className={`rounded-lg border px-3 py-2 text-xs font-bold disabled:opacity-40 ${effectiveLabel === "negative" ? "border-red-200 bg-red-500/30 text-red-50 ring-1 ring-red-300" : "border-red-300/40 bg-red-500/10 text-red-100 hover:bg-red-400/20"}`}
                                            >
                                                {saving && saveFeedback?.label === "negative" ? "SAVING…" : effectiveLabel === "negative" ? "✓ VALIDATED BACKGROUND" : "VALIDATED BACKGROUND"}
                                            </GameButton>
                                            <GameButton
                                                onPress={() => void submitLabel(candidate, "uncertain")}
                                                disabled={saving || analyzing}
                                                className={`rounded-lg border px-3 py-2 text-xs font-bold disabled:opacity-40 ${effectiveLabel === "uncertain" ? "border-yellow-200 bg-yellow-500/30 text-yellow-50 ring-1 ring-yellow-300" : "border-yellow-300/40 bg-yellow-500/10 text-yellow-100 hover:bg-yellow-400/20"}`}
                                            >
                                                {saving && saveFeedback?.label === "uncertain" ? "SAVING…" : effectiveLabel === "uncertain" ? "✓ NEEDS MORE EVIDENCE" : "NEEDS MORE EVIDENCE"}
                                            </GameButton>
                                        </div>
                                    </div>
                                );
                            })}

                            {!topCandidates.length && <p className="text-sm text-slate-500">No saved candidates are available for this session.</p>}
                        </div>
                    )}

                    {activeTab === "all_ids" && (
                        <div className="space-y-2">
                            <div className="sticky top-0 z-10 rounded-xl border border-cyan-300/30 bg-slate-950/95 p-3">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <div>
                                        <p className="font-black text-cyan-100">ALL OBSERVED SESSION IDS</p>
                                        <p className="text-[10px] text-slate-500">
                                            {filteredAllIdRows.length} shown / {allIdRows.length} observed. Rich byte evidence remains in TOP IDS; every row here can be labeled for supervised learning.
                                        </p>
                                    </div>
                                    <input
                                        value={allIdSearch}
                                        onChange={(event) => setAllIdSearch(event.target.value)}
                                        placeholder="Filter hex, decimal, or role"
                                        className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-cyan-100 outline-none focus:border-cyan-300 sm:w-64"
                                    />
                                </div>
                            </div>

                            {filteredAllIdRows.map(([canId, row]) => {
                                const target: CandidateLabelTarget = {
                                    can_id: row.can_id,
                                    can_id_hex: canId,
                                };
                                const labelKey = String(row.can_id);
                                const draftKey = `${sessionId ?? "no-session"}:${row.can_id}`;
                                const existingLabel = mlLabels[labelKey];
                                const saveFeedback = candidateFeedback[draftKey];
                                const effectiveLabel = saveFeedback?.state !== "error"
                                    ? saveFeedback?.label ?? existingLabel?.label
                                    : existingLabel?.label;
                                const saving = labelingCandidateId === row.can_id
                                    || saveFeedback?.state === "saving";

                                return (
                                    <div key={canId} className={`rounded-xl border p-3 ${candidateTone(row.confidence ?? 0)}`}>
                                        <div className="flex flex-wrap items-start justify-between gap-2">
                                            <div>
                                                <p className="text-lg font-black">{canId}</p>
                                                <p className="text-[10px] text-slate-500">
                                                    decimal {row.can_id} · {row.frame_count} frames · {row.change_count} changes · {fixed(row.frequency_hz)} Hz
                                                </p>
                                                <p className="text-[10px] text-slate-400">
                                                    role: {row.candidate_role ?? "unclassified"} · evidence {percent(row.confidence ?? row.correlation_score)}
                                                </p>
                                            </div>
                                            <span className={`rounded border px-2 py-1 text-[10px] font-black ${labelTone(effectiveLabel)}`}>
                                                {saveFeedback?.state === "saving"
                                                    ? "SAVING…"
                                                    : saveFeedback?.state === "saved"
                                                        ? `✓ ${labelText(effectiveLabel)} SAVED`
                                                        : labelText(effectiveLabel)}
                                            </span>
                                        </div>

                                        <div className="mt-2 grid grid-cols-8 gap-1">
                                            {byteCells(row.byte_change_counts)}
                                        </div>

                                        <div className="mt-2 grid gap-1 sm:grid-cols-3">
                                            <GameButton
                                                onPress={() => void submitLabel(target, "positive")}
                                                disabled={saving || analyzing}
                                                className={`rounded border px-2 py-1 text-[10px] font-bold disabled:opacity-40 ${effectiveLabel === "positive" ? "border-green-200 bg-green-500/30 text-green-50 ring-1 ring-green-300" : "border-green-300/30 bg-green-500/10 text-green-100"}`}
                                            >
                                                {effectiveLabel === "positive" ? "✓ RELEVANT" : "RELEVANT"}
                                            </GameButton>
                                            <GameButton
                                                onPress={() => void submitLabel(target, "negative")}
                                                disabled={saving || analyzing}
                                                className={`rounded border px-2 py-1 text-[10px] font-bold disabled:opacity-40 ${effectiveLabel === "negative" ? "border-red-200 bg-red-500/30 text-red-50 ring-1 ring-red-300" : "border-red-300/30 bg-red-500/10 text-red-100"}`}
                                            >
                                                {effectiveLabel === "negative" ? "✓ BACKGROUND" : "BACKGROUND"}
                                            </GameButton>
                                            <GameButton
                                                onPress={() => void submitLabel(target, "uncertain")}
                                                disabled={saving || analyzing}
                                                className={`rounded border px-2 py-1 text-[10px] font-bold disabled:opacity-40 ${effectiveLabel === "uncertain" ? "border-yellow-200 bg-yellow-500/30 text-yellow-50 ring-1 ring-yellow-300" : "border-yellow-300/30 bg-yellow-500/10 text-yellow-100"}`}
                                            >
                                                {effectiveLabel === "uncertain" ? "✓ MORE EVIDENCE" : "MORE EVIDENCE"}
                                            </GameButton>
                                        </div>
                                    </div>
                                );
                            })}

                            {!filteredAllIdRows.length && (
                                <p className="text-sm text-slate-500">No CAN IDs match this filter.</p>
                            )}
                        </div>
                    )}

                    {activeTab === "heatmap" && (
                        <div className="space-y-2">
                            {heatRows.map(([canId, row]) => (
                                <div key={canId} className="rounded-xl border border-green-400/20 bg-slate-900/80 p-3">
                                    <div className="mb-2 flex items-center justify-between gap-3">
                                        <span className="font-black text-green-100">{canId}</span>
                                        <span className="text-xs text-slate-500">{row.change_count} changes · {fixed(row.frequency_hz)} Hz</span>
                                    </div>
                                    <div className="grid grid-cols-8 gap-1">{byteCells(row.byte_change_counts)}</div>
                                </div>
                            ))}
                            {!heatRows.length && <p className="text-sm text-slate-500">No heatmap data.</p>}
                        </div>
                    )}

                    {activeTab === "llm" && (
                        <div className="rounded-xl border border-purple-300/30 bg-purple-500/10 p-4 text-sm text-purple-100">
                            <div className="mb-3 flex items-center justify-between gap-3"><span className="font-black">OLLAMA REPORT</span><span className="text-xs text-purple-200">{analysis?.llm_model ?? "no model"}</span></div>
                            <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed text-slate-200">{analysis?.analysis ?? "No saved report. Run EXPLAIN."}</pre>
                        </div>
                    )}

                    {activeTab === "logs" && (
                        <div className="rounded-xl border border-green-400/20 bg-black/60 p-3">
                            <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed text-green-200">{logs.length ? logs.join("\n") : "> no logs"}</pre>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}