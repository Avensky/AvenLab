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

export type BrainCandidate = {
    can_id: number;
    can_id_hex: string;
    frame_count: number;
    frequency_hz: number | null;
    change_count: number;
    change_ratio?: number;
    changed_frame_ratio?: number;
    byte_change_counts: Record<string, number>;
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
    analysis_mode?: "baseline_profile" | "target_correlation" | string;
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
        }
    >;
    llm_model: string | null;
    llm_available: boolean;
    llm_error: string | null;
    analysis: string | null;
    persisted: boolean;
};

type BrainTab = "summary" | "candidates" | "heatmap" | "llm" | "logs";

export type CandidateLabelMetadata = {
    validation_method?: string;
    independent_sessions?: number;
    baseline_checked?: boolean;
    return_state_verified?: boolean;
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
        candidate: BrainCandidate,
        label: CandidateMlLabelValue,
        notes: string,
        metadata: CandidateLabelMetadata,
    ) => Promise<void> | void;
    onToggleLlm: () => void;
    onToggleEmbeddings: () => void;
    onToggleAutoAnalyze: () => void;
};

const TABS: Array<{ id: BrainTab; label: string }> = [
    { id: "summary", label: "SUMMARY" },
    { id: "candidates", label: "IDS + LABELS" },
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
    onToggleLlm,
    onToggleEmbeddings,
    onToggleAutoAnalyze,
}: SignalReconBrainConsoleProps) {
    const [activeTab, setActiveTab] = useState<BrainTab>("summary");
    const [notesByCandidate, setNotesByCandidate] = useState<Record<string, string>>({});
    const [sessionsByCandidate, setSessionsByCandidate] = useState<Record<string, string>>({});
    const [localError, setLocalError] = useState<string | null>(null);

    const topCandidates = useMemo(
        () => [...(analysis?.candidates ?? [])].sort((a, b) => b.confidence - a.confidence).slice(0, 15),
        [analysis],
    );

    const topCandidate = topCandidates[0] ?? null;
    const heatRows = useMemo(
        () =>
            Object.entries(analysis?.heatmap ?? {})
                .sort(([, a], [, b]) => b.change_count - a.change_count)
                .slice(0, 16),
        [analysis],
    );

    const isBaselineProfile =
        analysis?.analysis_mode === "baseline_profile" ||
        analysis?.target_expected === false ||
        analysis?.baseline_profile?.target_expected === false;

    const resultModeLabel = isBaselineProfile ? "NOISE PROFILE" : "SIGNAL HYPOTHESIS";

    const submitLabel = async (candidate: BrainCandidate, label: CandidateMlLabelValue) => {
        const labelKey = String(candidate.can_id);
        const draftKey = `${sessionId ?? "no-session"}:${candidate.can_id}`;

        const notes = (
            notesByCandidate[draftKey] ??
            mlLabels[labelKey]?.notes ??
            ""
        ).trim();

        const independentSessions =
            Number.parseInt(sessionsByCandidate[draftKey] ?? "0", 10) || 0;

        if (label === "positive") {
            if (notes.length < 20) {
                setLocalError("Validated Relevant requires at least 20 characters of validation notes.");
                return;
            }
            if (independentSessions < 2) {
                setLocalError("Validated Relevant requires evidence from at least two independent sessions.");
                return;
            }
        }

        setLocalError(null);
        await onLabelCandidate(candidate, label, notes, label === "positive" ? {
            validation_method: "repeated_controlled_sessions",
            independent_sessions: independentSessions,
        } : {});
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
                                        </div>
                                        <div className="grid gap-2 text-sm text-slate-300 sm:grid-cols-2">
                                            <p><span className="text-slate-500">statistical evidence:</span> {percent(topCandidate.confidence_before_baseline)}</p>
                                            <p><span className="text-slate-500">baseline-adjusted evidence:</span> {percent(topCandidate.confidence_before_ml ?? topCandidate.confidence)}</p>
                                            <p><span className="text-slate-500">ML probability:</span> {percent(topCandidate.ml_probability)}</p>
                                            <p><span className="text-slate-500">marker score:</span> {fixed(topCandidate.correlation_score)}</p>
                                            <p><span className="text-slate-500">frames:</span> {topCandidate.frame_count}</p>
                                            <p><span className="text-slate-500">changes:</span> {topCandidate.change_count}</p>
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
                                const statisticalConfidence = candidate.confidence_before_baseline ?? candidate.confidence_before_ml ?? candidate.confidence;
                                const baselineAdjustedConfidence = candidate.confidence_before_ml ?? candidate.confidence;
                                const saving = labelingCandidateId === candidate.can_id;

                                return (
                                    <div key={candidate.can_id_hex} className={`rounded-xl border p-3 ${candidateTone(candidate.confidence)}`}>
                                        <div className="flex flex-wrap items-start justify-between gap-3">
                                            <div>
                                                <p className="text-xl font-black">{candidate.can_id_hex}</p>
                                                <p className="text-xs text-slate-500">decimal {candidate.can_id} · {candidate.frame_count} frames · {candidate.change_count} changes</p>
                                            </div>
                                            <span className={`rounded-lg border px-2 py-1 text-[10px] font-black ${labelTone(existingLabel?.label)}`}>{labelText(existingLabel?.label)}</span>
                                        </div>

                                        <div className="mt-3 grid grid-cols-2 gap-2 text-xs lg:grid-cols-4">
                                            <div className="rounded-lg border border-slate-700 bg-black/20 p-2"><p className="text-slate-500">Statistical evidence</p><p className="text-lg font-black">{percent(statisticalConfidence)}</p></div>
                                            <div className="rounded-lg border border-slate-700 bg-black/20 p-2"><p className="text-slate-500">Baseline-adjusted evidence</p><p className="text-lg font-black">{percent(baselineAdjustedConfidence)}</p></div>
                                            <div className="rounded-lg border border-slate-700 bg-black/20 p-2"><p className="text-slate-500">ML probability</p><p className="text-lg font-black">{percent(candidate.ml_probability)}</p></div>
                                            <div className="rounded-lg border border-slate-700 bg-black/20 p-2"><p className="text-slate-500">Final evidence score</p><p className="text-lg font-black">{percent(candidate.confidence)}</p></div>
                                        </div>

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
                                                    min={0}
                                                    value={sessionsByCandidate[draftKey] ?? ""}
                                                    onChange={(event) =>
                                                        setSessionsByCandidate((current) => ({
                                                            ...current,
                                                            [draftKey]: event.target.value,
                                                        }))
                                                    }
                                                    placeholder="required for relevant"
                                                    className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 p-2 text-xs text-slate-200 outline-none focus:border-green-300"
                                                />
                                                <p className="mt-2 text-[10px] text-slate-500">Positive labels require 2+ repeated sessions.</p>
                                            </label>
                                        </div>

                                        {existingLabel?.notes && (
                                            <div className="mt-2 rounded-lg border border-slate-700 bg-black/20 p-2 text-xs text-slate-400">
                                                <span className="text-slate-500">Existing label notes:</span> {existingLabel.notes}
                                            </div>
                                        )}

                                        <div className="mt-3 grid gap-2 sm:grid-cols-3">
                                            <GameButton onPress={() => void submitLabel(candidate, "positive")} disabled={saving || analyzing} className="rounded-lg border border-green-300/40 bg-green-500/10 px-3 py-2 text-xs font-bold text-green-100 hover:bg-green-400/20 disabled:opacity-40">VALIDATED RELEVANT</GameButton>
                                            <GameButton onPress={() => void submitLabel(candidate, "negative")} disabled={saving || analyzing} className="rounded-lg border border-red-300/40 bg-red-500/10 px-3 py-2 text-xs font-bold text-red-100 hover:bg-red-400/20 disabled:opacity-40">VALIDATED BACKGROUND</GameButton>
                                            <GameButton onPress={() => void submitLabel(candidate, "uncertain")} disabled={saving || analyzing} className="rounded-lg border border-yellow-300/40 bg-yellow-500/10 px-3 py-2 text-xs font-bold text-yellow-100 hover:bg-yellow-400/20 disabled:opacity-40">NEEDS MORE EVIDENCE</GameButton>
                                        </div>
                                    </div>
                                );
                            })}

                            {!topCandidates.length && <p className="text-sm text-slate-500">No saved candidates are available for this session.</p>}
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