import { useEffect, useMemo, useState } from "react";
import { GameButton } from "../../components/GameButton";
import { getApiBaseUrl, useCanBusStore } from "../../store/canBusStore";
import {
    useSignalReconStore,
    type ReconStep,
} from "../../store/signalReconStore";
import { getStepTotalMs } from "../../store/signalReconMissions";
import {
    SignalReconBrainConsole,
    type BrainAnalysisResult,
    type BrainCandidate,
    type CandidateLabelMetadata,
    type CandidateMlLabel,
    type CandidateMlLabelValue,
    type MlModelSummary,
    type MlReadiness,
} from "./SignalReconBrainConsole";

export type MissionRunSummary = {
    session_id: string;
    mission_code: string;
    vehicle_slug: string;
    bus_interface: string;
    bus_mode: string;
    capture_kind: string;
    source_label: string;
    completed: boolean;
    analyzed: boolean;
    status: string;
    analysis_mode: string | null;
    confidence: number | null;
    top_can_id_hex: string | null;
    frame_count: number;
    marker_count: number;
    started_at: string | null;
    ended_at: string | null;
    report_id?: string | null;
};

type SignalReconMissionProps = {
    onExit?: () => void;
    initialSessionId?: string | null;
    initialMissionProgress?: MissionRunSummary | null;
    sessionHistory?: MissionRunSummary[];
    onDatabaseChanged?: () => void;
};

type MissionPanel = "game" | "steps" | "details" | "session";

type BrainAnalyzeOptions = {
    useLlmOverride?: boolean;
    useEmbeddingsOverride?: boolean;
    persist?: boolean;
    openConsole?: boolean;
};

type SavedAnalysisResponse = {
    ok?: boolean;
    session_id?: string;
    vector_memory?: BrainAnalysisResult["vector_memory"];
    marker_selection?: BrainAnalysisResult["marker_selection"];
    frame_selection?: BrainAnalysisResult["frame_selection"];
    frames_available?: number;
    confidence_semantics?: string;
    marker_window_ms?: number;
    features?: Array<Record<string, unknown>>;
    correlations?: Array<Record<string, unknown>>;
    latest_report?: {
        content?: string | null;
        metadata?: unknown;
    } | null;
};

const PANELS: Array<{ id: MissionPanel; label: string }> = [
    { id: "game", label: "PLAY" },
    { id: "steps", label: "STEPS" },
    { id: "details", label: "DETAILS" },
    { id: "session", label: "SESSION" },
];

function formatMs(ms: number) {
    if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
    return `${ms}ms`;
}

function formatPhase(phase: string) {
    return phase.replace(/_/g, " ").toUpperCase();
}

function phaseLabel(phase: string) {
    if (phase === "baseline") return "BASELINE CAPTURE";
    if (phase === "countdown") return "GET READY";
    if (phase === "action") return "ACTION WINDOW OPEN";
    if (phase === "capture") return "POST-ACTION CAPTURE";
    if (phase === "complete") return "STEP COMPLETE";
    if (phase === "cancelled") return "RUN CANCELLED";
    return "IDLE";
}

function getStepSource(step: ReconStep | null) {
    const value = step?.metadata?.sub_mission_title;
    return typeof value === "string" ? value : null;
}

function shortSessionId(sessionId: string | null) {
    if (!sessionId) return "not started";
    if (sessionId.length <= 14) return sessionId;
    return `${sessionId.slice(0, 8)}…${sessionId.slice(-4)}`;
}

function asRecord(value: unknown): Record<string, unknown> {
    if (value && typeof value === "object" && !Array.isArray(value)) {
        return value as Record<string, unknown>;
    }
    return {};
}

function parseMetadata(value: unknown): Record<string, unknown> {
    if (typeof value === "string") {
        try {
            return asRecord(JSON.parse(value));
        } catch {
            return {};
        }
    }
    return asRecord(value);
}

function toNumber(value: unknown, fallback = 0) {
    return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function toNullableString(value: unknown) {
    return typeof value === "string" && value.length > 0 ? value : null;
}

function formatSessionDate(value: string | null) {
    if (!value) return "unknown time";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString();
}

function getMlAdminToken() {
    const storageKey = "avenlab.mlAdminToken";
    const existing = window.sessionStorage.getItem(storageKey)?.trim();
    if (existing) return existing;

    const entered = window.prompt(
        "Enter the AvenLab ML admin token. It will be kept only for this browser tab.",
    )?.trim();
    if (!entered) return null;

    window.sessionStorage.setItem(storageKey, entered);
    return entered;
}

export function SignalReconMission({
    onExit,
    initialSessionId = null,
    initialMissionProgress = null,
    sessionHistory = [],
    onDatabaseChanged,
}: SignalReconMissionProps) {
    const selectedMission = useSignalReconStore((s) => s.selectedMission);
    const vehicleSlug = useSignalReconStore((s) => s.vehicleSlug);
    const steps = useSignalReconStore((s) => s.steps);
    const activeSessionId = useSignalReconStore((s) => s.activeSessionId);
    const activeRunId = useSignalReconStore((s) => s.activeRunId);
    const activeStep = useSignalReconStore((s) => s.activeStep);
    const activeStepIndex = useSignalReconStore((s) => s.activeStepIndex);
    const activePhase = useSignalReconStore((s) => s.activePhase);
    const phaseStartedAt = useSignalReconStore((s) => s.phaseStartedAt);
    const phaseEndsAt = useSignalReconStore((s) => s.phaseEndsAt);
    const selectStepByIndex = useSignalReconStore((s) => s.selectStepByIndex);
    const startSession = useSignalReconStore((s) => s.startSession);
    const runStep = useSignalReconStore((s) => s.runStep);
    const runSelectedMission = useSignalReconStore((s) => s.runSelectedMission);
    const cancelActiveRun = useSignalReconStore((s) => s.cancelActiveRun);
    const stopSession = useSignalReconStore((s) => s.stopSession);

    const selectedInterface = useCanBusStore((s) => s.selectedInterface);
    const selectedMode = useCanBusStore((s) => s.selectedMode);

    const [now, setNow] = useState(() => performance.now());
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [activePanel, setActivePanel] = useState<MissionPanel>("game");

    const [brainOpen, setBrainOpen] = useState(false);
    const [brainAnalyzing, setBrainAnalyzing] = useState(false);
    const [brainError, setBrainError] = useState<string | null>(null);
    const [brainAnalysis, setBrainAnalysis] = useState<BrainAnalysisResult | null>(null);
    const [brainLogs, setBrainLogs] = useState<string[]>([]);
    const [lastAnalyzedSessionId, setLastAnalyzedSessionId] = useState<string | null>(null);
    const [useLlm, setUseLlm] = useState(true);
    const [useEmbeddings, setUseEmbeddings] = useState(true);
    const [autoAnalyze, setAutoAnalyze] = useState(true);

    const [selectedSavedSessionId, setSelectedSavedSessionId] = useState<string | null>(
        initialSessionId ?? initialMissionProgress?.session_id ?? null,
    );
    const [mlLabels, setMlLabels] = useState<Record<string, CandidateMlLabel>>({});
    const [mlReadiness, setMlReadiness] = useState<MlReadiness | null>(null);
    const [activeModel, setActiveModel] = useState<MlModelSummary | null>(null);
    const [mlLoading, setMlLoading] = useState(false);
    const [mlError, setMlError] = useState<string | null>(null);
    const [labelingCandidateId, setLabelingCandidateId] = useState<number | null>(null);

    useEffect(() => {
        const id = window.setInterval(() => setNow(performance.now()), 50);
        return () => window.clearInterval(id);
    }, []);

    const isRunning = Boolean(activeRunId);
    const displayStep = activeStep ?? steps[activeStepIndex] ?? null;
    const selectedStepSource = getStepSource(displayStep);
    const activeStepNumber = steps.length
        ? Math.min(activeStepIndex + 1, steps.length)
        : 0;

    useEffect(() => {
        if (isRunning) setActivePanel("game");
    }, [activePhase, isRunning]);

    const phaseDuration = useMemo(() => {
        if (phaseStartedAt === null || phaseEndsAt === null) return 1;
        return Math.max(phaseEndsAt - phaseStartedAt, 1);
    }, [phaseEndsAt, phaseStartedAt]);

    const phaseElapsed =
        phaseStartedAt === null ? 0 : Math.max(now - phaseStartedAt, 0);
    const phaseProgress =
        phaseEndsAt === null ? 0 : Math.min(phaseElapsed / phaseDuration, 1);
    const timeRemainingMs =
        phaseEndsAt === null ? 0 : Math.max(phaseEndsAt - now, 0);

    const countdownNumber =
        activePhase === "countdown"
            ? Math.max(1, Math.ceil(timeRemainingMs / 1000))
            : null;

    const missionProgress = steps.length
        ? Math.min(
            1,
            (activeStepIndex + (activePhase === "complete" ? 1 : phaseProgress)) /
            steps.length,
        )
        : 0;


    const captureKind = selectedMode === "simulation" || selectedInterface === "vcan0" ? "simulation" : "live";
    const selectedSessionSummary = useMemo(
        () => sessionHistory.find((item) => item.session_id === selectedSavedSessionId) ?? null,
        [selectedSavedSessionId, sessionHistory],
    );
    const reviewBusInterface = selectedSessionSummary?.bus_interface ?? selectedInterface;
    const reviewBusMode = selectedSessionSummary?.bus_mode ?? selectedMode;
    const reviewCaptureKind = selectedSessionSummary?.capture_kind ?? captureKind;
    const reviewSourceLabel = selectedSessionSummary?.source_label ?? (
        reviewBusMode === "listen-only"
            ? "LIVE / LISTEN-ONLY"
            : reviewBusMode === "live"
                ? "LIVE / ACTIVE"
                : "SIMULATION"
    );
    const busSafetyLabel = selectedMode === "listen-only"
        ? "LIVE / LISTEN-ONLY"
        : selectedMode === "live"
            ? "LIVE / ACTIVE"
            : "SIMULATION";
    const topCandidate = useMemo(
        () => [...(brainAnalysis?.candidates ?? [])].sort((a, b) => b.confidence - a.confidence)[0] ?? null,
        [brainAnalysis],
    );
    const confidenceSummary = topCandidate
        ? `${topCandidate.can_id_hex} ${Math.round(topCandidate.confidence * 100)}%`
        : brainAnalysis?.analysis_mode === "baseline_profile"
            ? "noise profile"
            : "not analyzed";
    const latestSessionId =
        activeSessionId ??
        selectedSavedSessionId ??
        brainAnalysis?.session_id ??
        lastAnalyzedSessionId ??
        initialSessionId ??
        initialMissionProgress?.session_id ??
        null;

    const panelIndex = PANELS.findIndex((panel) => panel.id === activePanel);
    const canGoBack = !isRunning && panelIndex > 0;
    const canGoForward = !isRunning && panelIndex < PANELS.length - 1;

    const goBack = () => {
        if (!canGoBack) return;
        setActivePanel(PANELS[panelIndex - 1].id);
    };

    const goForward = () => {
        if (!canGoForward) return;
        setActivePanel(PANELS[panelIndex + 1].id);
    };

    const ensureSession = async () => {
        if (activeSessionId) {
            setLastAnalyzedSessionId(activeSessionId);
            return activeSessionId;
        }

        const sessionId = await startSession({
            busInterface: selectedInterface,
            busMode: selectedMode,
        });
        setLastAnalyzedSessionId(sessionId);
        return sessionId;
    };

    const appendBrainLog = (line: string) => {
        setBrainLogs((current) => [
            ...current,
            `${new Date().toLocaleTimeString()} ${line}`,
        ].slice(-80));
    };

    const resolveAnalysisSessionId = (sessionIdOverride?: string) =>
        sessionIdOverride ??
        useSignalReconStore.getState().activeSessionId ??
        activeSessionId ??
        selectedSavedSessionId ??
        brainAnalysis?.session_id ??
        lastAnalyzedSessionId ??
        initialSessionId ??
        initialMissionProgress?.session_id ??
        null;

    const refreshMlContext = async (sessionIdOverride?: string) => {
        const sessionId = resolveAnalysisSessionId(sessionIdOverride);
        if (!sessionId || !selectedMission) {
            setMlLabels({});
            setMlReadiness(null);
            setActiveModel(null);
            return;
        }

        const summary = sessionHistory.find((item) => item.session_id === sessionId);
        const scopeInterface = summary?.bus_interface ?? reviewBusInterface;
        const scopeMode = summary?.bus_mode ?? reviewBusMode;
        const scopeKind = summary?.capture_kind ?? reviewCaptureKind;
        const params = new URLSearchParams({
            vehicle_slug: vehicleSlug,
            mission_code: selectedMission.mission_code,
            bus_interface: scopeInterface,
            bus_mode: scopeMode,
            capture_kind: scopeKind,
        });

        setMlLoading(true);
        setMlError(null);
        try {
            const [labelsResponse, readinessResponse, statusResponse] = await Promise.all([
                fetch(`${getApiBaseUrl()}/data/can/session/${sessionId}/ml-labels`),
                fetch(`${getApiBaseUrl()}/data/can/ml/readiness?${params.toString()}`),
                fetch(`${getApiBaseUrl()}/data/can/ml/status?${params.toString()}`),
            ]);

            const labelsData = await labelsResponse.json().catch(() => ({}));
            const readinessData = await readinessResponse.json().catch(() => ({}));
            const statusData = await statusResponse.json().catch(() => ({}));

            if (!labelsResponse.ok) {
                throw new Error(labelsData.detail ?? `Label read failed with HTTP ${labelsResponse.status}.`);
            }
            if (!readinessResponse.ok) {
                throw new Error(readinessData.detail ?? `Readiness read failed with HTTP ${readinessResponse.status}.`);
            }
            if (!statusResponse.ok) {
                throw new Error(statusData.detail ?? `Model status read failed with HTTP ${statusResponse.status}.`);
            }

            setMlLabels((labelsData.labels ?? {}) as Record<string, CandidateMlLabel>);
            setMlReadiness(readinessData as MlReadiness);
            const models = Array.isArray(statusData.models)
                ? (statusData.models as MlModelSummary[])
                : [];
            setActiveModel(models.find((model) => model.is_active) ?? null);
        } catch (err) {
            const message = err instanceof Error ? err.message : "Failed to read ML context.";
            setMlError(message);
            appendBrainLog(`[ml] read error: ${message}`);
        } finally {
            setMlLoading(false);
        }
    };

    const handleAnalyzeSession = async (
        sessionIdOverride?: string,
        source: "manual" | "step-complete" | "mission-complete" | "llm-explain" = "manual",
        options: BrainAnalyzeOptions = {},
    ) => {
        const sessionId = resolveAnalysisSessionId(sessionIdOverride);
        const requestUseLlm = options.useLlmOverride ?? useLlm;
        const requestUseEmbeddings = options.useEmbeddingsOverride ?? useEmbeddings;

        if (options.openConsole !== false) {
            setBrainOpen(true);
        }

        if (!sessionId) {
            setBrainError("Start or record a session before running Pi Brain analysis.");
            appendBrainLog("[ai] blocked: no session id available");
            return;
        }

        setBrainAnalyzing(true);
        setBrainError(null);
        appendBrainLog(`[ai] ${source}: analyzing ${shortSessionId(sessionId)}`);
        appendBrainLog(`[bus] ${selectedInterface}/${selectedMode}`);
        appendBrainLog(
            `[ai] options: llm=${requestUseLlm ? "on" : "off"} embeddings=${requestUseEmbeddings ? "on" : "off"}`,
        );

        try {
            const res = await fetch(
                `${getApiBaseUrl()}/data/can/session/${sessionId}/analyze`,
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        marker_window_ms:
                            selectedMission?.analysis_mode === "baseline_profile" ? 900 : 300,
                        use_llm: requestUseLlm,
                        use_embeddings: requestUseEmbeddings,
                        llm_model: "qwen2.5:3b",
                        embed_model: "nomic-embed-text",
                        persist: options.persist ?? true,
                    }),
                },
            );

            const data = await res.json().catch(() => ({}));

            if (!res.ok || data.ok === false) {
                throw new Error(
                    typeof data.detail === "string"
                        ? data.detail
                        : typeof data.error === "string"
                            ? data.error
                            : `Pi Brain analysis failed with HTTP ${res.status}.`,
                );
            }

            const nextAnalysis = data as BrainAnalysisResult;

            if (requestUseLlm && nextAnalysis.analysis_source !== "llm") {
                const llmMessage =
                    nextAnalysis.llm_error?.trim() ||
                    "Ollama did not produce a report. Showing statistical fallback results.";
                setBrainError(`LLM unavailable: ${llmMessage}`);
                appendBrainLog(`[llm] fallback: ${llmMessage}`);
            } else {
                setBrainError(null);
            }

            setBrainAnalysis(nextAnalysis);
            setSelectedSavedSessionId(nextAnalysis.session_id ?? sessionId);
            setLastAnalyzedSessionId(nextAnalysis.session_id ?? sessionId);
            await refreshMlContext(nextAnalysis.session_id ?? sessionId);
            appendBrainLog(
                `[ai] done: mode=${nextAnalysis.analysis_mode ?? "unknown"} frames=${nextAnalysis.frames_analyzed} markers=${nextAnalysis.markers} candidates=${nextAnalysis.candidates.length}`,
            );
            appendBrainLog(
                `[memory] query=${nextAnalysis.vector_memory?.query_embedded ? "yes" : "no"} matches=${nextAnalysis.vector_memory?.match_count ?? 0} stored=${nextAnalysis.vector_memory?.stored ? "yes" : "no"}`,
            );
            appendBrainLog(
                `[llm] ${
                    nextAnalysis.analysis_source === "llm"
                        ? `report generated (${nextAnalysis.llm_model ?? "model unknown"})`
                        : `fallback used${nextAnalysis.llm_error ? `: ${nextAnalysis.llm_error}` : ""}`
                }`,
            );
        } catch (err) {
            const message =
                err instanceof Error ? err.message : "Pi Brain analysis failed.";
            setBrainError(message);
            appendBrainLog(`[ai] error: ${message}`);
        } finally {
            setBrainAnalyzing(false);
        }
    };

    const handleQuickAnalyze = (
        sessionIdOverride?: string,
        source: "manual" | "step-complete" | "mission-complete" = "manual",
    ) =>
        handleAnalyzeSession(sessionIdOverride, source, {
            useLlmOverride: false,
            useEmbeddingsOverride: useEmbeddings,
            persist: true,
        });

    const handleFullAnalyze = (
        sessionIdOverride?: string,
        source: "manual" | "step-complete" | "mission-complete" = "manual",
    ) =>
        handleAnalyzeSession(sessionIdOverride, source, {
            useLlmOverride: useLlm,
            useEmbeddingsOverride: useEmbeddings,
            persist: true,
        });

    const handleExplainWithLlm = () => {
        setUseLlm(true);
        setUseEmbeddings(true);
        return handleAnalyzeSession(undefined, "llm-explain", {
            useLlmOverride: true,
            useEmbeddingsOverride: true,
            persist: true,
        });
    };

    const handleLoadLatestAnalysis = async (
        sessionIdOverride?: string,
        openConsole = true,
    ) => {
        const sessionId = resolveAnalysisSessionId(sessionIdOverride);
        if (openConsole) setBrainOpen(true);

        if (!sessionId) {
            setBrainError("No session id available to read from the database.");
            appendBrainLog("[db] blocked: no session id available");
            return;
        }

        setBrainAnalyzing(true);
        setBrainError(null);
        appendBrainLog(`[db] reading latest saved analysis for ${shortSessionId(sessionId)}`);

        try {
            const res = await fetch(`${getApiBaseUrl()}/data/can/session/${sessionId}/analysis`);
            const data = (await res.json().catch(() => ({}))) as SavedAnalysisResponse;

            if (!res.ok || data.ok === false) {
                throw new Error(`Database analysis read failed with HTTP ${res.status}.`);
            }

            const reportMetadata = parseMetadata(data.latest_report?.metadata);
            const candidates = Array.isArray(reportMetadata.top_candidates)
                ? (reportMetadata.top_candidates as BrainAnalysisResult["candidates"])
                : [];
            const heatmap = asRecord(reportMetadata.heatmap) as BrainAnalysisResult["heatmap"];
            const baselineProfile = asRecord(reportMetadata.baseline_profile) as BrainAnalysisResult["baseline_profile"];
            const analysisMode = toNullableString(reportMetadata.analysis_mode);
            const analysisSource = toNullableString(reportMetadata.analysis_source);
            const model = toNullableString(reportMetadata.model);
            const llmError = toNullableString(reportMetadata.llm_error);
            const llmSucceeded = reportMetadata.llm_succeeded === true;
            const reportContent = data.latest_report?.content ?? null;
            const vectorMemory = (
                data.vector_memory ??
                asRecord(reportMetadata.vector_memory)
            ) as BrainAnalysisResult["vector_memory"];
            const markerWindowMs = toNumber(
                data.marker_window_ms ?? reportMetadata.marker_window_ms,
            );
            const markerSelection = (
                data.marker_selection ??
                asRecord(reportMetadata.marker_selection)
            ) as BrainAnalysisResult["marker_selection"];
            const frameSelection = (
                data.frame_selection ??
                asRecord(reportMetadata.frame_selection)
            ) as BrainAnalysisResult["frame_selection"];
            const confidenceSemantics = toNullableString(
                data.confidence_semantics ??
                reportMetadata.confidence_semantics,
            );

            const nextAnalysis: BrainAnalysisResult = {
                ok: true,
                session_id: data.session_id ?? sessionId,
                analysis_mode: analysisMode ?? undefined,
                analysis_source:
                    analysisSource === "llm" || analysisSource === "fallback"
                        ? analysisSource
                        : undefined,
                llm_requested:
                    typeof reportMetadata.llm_requested === "boolean"
                        ? reportMetadata.llm_requested
                        : undefined,
                llm_succeeded: llmSucceeded,
                target_expected:
                    typeof reportMetadata.target_expected === "boolean"
                        ? reportMetadata.target_expected
                        : undefined,
                baseline_profile: baselineProfile,
                frames_analyzed: toNumber(reportMetadata.frames_analyzed),
                frames_available: toNumber(
                    data.frames_available ??
                    reportMetadata.frames_available ??
                    frameSelection?.total_frames,
                ),
                markers: toNumber(reportMetadata.markers),
                selected_action_markers: toNumber(
                    reportMetadata.marker_selection &&
                    typeof reportMetadata.marker_selection === "object"
                        ? asRecord(reportMetadata.marker_selection).action_markers
                        : markerSelection?.action_markers,
                ),
                marker_selection: markerSelection,
                frame_selection: frameSelection,
                confidence_semantics: confidenceSemantics ?? undefined,
                marker_window_ms: markerWindowMs || undefined,
                marker_window_coverage: toNumber(reportMetadata.marker_window_coverage),
                vector_memory: vectorMemory,
                candidates,
                heatmap,
                llm_model: model,
                llm_available: llmSucceeded && Boolean(reportContent),
                llm_error: llmError,
                analysis: reportContent,
                persisted: true,
            };

            setBrainAnalysis(nextAnalysis);
            setSelectedSavedSessionId(nextAnalysis.session_id);
            setLastAnalyzedSessionId(nextAnalysis.session_id);
            await refreshMlContext(nextAnalysis.session_id);
            appendBrainLog(
                `[db] loaded: features=${data.features?.length ?? 0} correlations=${data.correlations?.length ?? 0} candidates=${candidates.length}`,
            );
            appendBrainLog(
                `[memory] saved context: matches=${vectorMemory?.match_count ?? 0}`,
            );
        } catch (err) {
            const message = err instanceof Error ? err.message : "Failed to read saved analysis.";
            setBrainError(message);
            appendBrainLog(`[db] error: ${message}`);
        } finally {
            setBrainAnalyzing(false);
        }
    };

    useEffect(() => {
        if (activeSessionId) return;
        const preferredSessionId =
            selectedSavedSessionId ??
            sessionHistory[0]?.session_id ??
            initialSessionId ??
            initialMissionProgress?.session_id ??
            null;
        if (!preferredSessionId) {
            setBrainAnalysis(null);
            setMlLabels({});
            setMlReadiness(null);
            setActiveModel(null);
            return;
        }

        if (selectedSavedSessionId !== preferredSessionId) {
            setSelectedSavedSessionId(preferredSessionId);
        }
        setLastAnalyzedSessionId(preferredSessionId);
        appendBrainLog(`[db] review mode: selected ${shortSessionId(preferredSessionId)}`);
        void handleLoadLatestAnalysis(preferredSessionId, false);
        // Reload only when mission/session history changes.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeSessionId, selectedMission?.mission_code, sessionHistory[0]?.session_id]);

    const handleSelectSavedSession = async (session: MissionRunSummary, openResults = false) => {
        if (activeSessionId || isRunning || brainAnalyzing) return;
        setSelectedSavedSessionId(session.session_id);
        setLastAnalyzedSessionId(session.session_id);
        setBrainAnalysis(null);
        setBrainError(null);
        appendBrainLog(`[db] selected ${shortSessionId(session.session_id)} · ${session.frame_count} frames`);
        await handleLoadLatestAnalysis(session.session_id, openResults);
    };

    const handleLabelCandidate = async (
        candidate: BrainCandidate,
        label: CandidateMlLabelValue,
        notes: string,
        metadata: CandidateLabelMetadata,
    ) => {
        const sessionId = resolveAnalysisSessionId();
        if (!sessionId) {
            setBrainError("Select an analyzed session before labeling a candidate.");
            return;
        }

        const token = getMlAdminToken();
        if (!token) {
            setBrainError("ML admin token is required to save human labels.");
            return;
        }

        setLabelingCandidateId(candidate.can_id);
        setBrainError(null);
        try {
            const response = await fetch(
                `${getApiBaseUrl()}/data/can/session/${sessionId}/candidate/${candidate.can_id}/label`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "X-AvenLab-ML-Token": token,
                    },
                    body: JSON.stringify({
                        label,
                        signal_name: selectedMission?.target ?? "unknown_signal",
                        notes: notes || null,
                        metadata,
                    }),
                },
            );
            const data = await response.json().catch(() => ({}));
            if (!response.ok || data.ok === false) {
                if (response.status === 403) {
                    window.sessionStorage.removeItem("avenlab.mlAdminToken");
                }
                throw new Error(data.detail ?? data.error ?? `Label save failed with HTTP ${response.status}.`);
            }

            appendBrainLog(`[ml] ${candidate.can_id_hex} labeled ${label}`);
            await refreshMlContext(sessionId);
            onDatabaseChanged?.();
        } catch (err) {
            const message = err instanceof Error ? err.message : "Failed to save candidate label.";
            setBrainError(message);
            appendBrainLog(`[ml] label error: ${message}`);
        } finally {
            setLabelingCandidateId(null);
        }
    };


    const handleDeleteSession = async (sessionIdOverride?: string) => {
        const sessionId = resolveAnalysisSessionId(sessionIdOverride);
        if (!sessionId || brainAnalyzing || isRunning || activeSessionId === sessionId) return;

        const summary = sessionHistory.find((item) => item.session_id === sessionId);
        const ok = window.confirm(
            `Delete CAN session ${shortSessionId(sessionId)}?\n\n` +
            `${summary?.frame_count ?? 0} frames · ${summary?.marker_count ?? 0} markers · ${summary?.status ?? "saved"}\n\n` +
            "Human labels and derived analysis for this session will also be removed. This cannot be undone.",
        );
        if (!ok) return;

        setBrainAnalyzing(true);
        setBrainError(null);
        appendBrainLog(`[db] deleting ${shortSessionId(sessionId)}`);

        try {
            const res = await fetch(`${getApiBaseUrl()}/data/can/session/${sessionId}`, {
                method: "DELETE",
            });
            const data = await res.json().catch(() => ({}));

            if (!res.ok || data.ok === false) {
                throw new Error(data.detail ?? data.error ?? `Delete failed with HTTP ${res.status}.`);
            }

            if (selectedSavedSessionId === sessionId || brainAnalysis?.session_id === sessionId) {
                setBrainAnalysis(null);
                setSelectedSavedSessionId(null);
                setLastAnalyzedSessionId(null);
                setMlLabels({});
                setMlReadiness(null);
                setActiveModel(null);
            }
            appendBrainLog(`[db] deleted ${shortSessionId(sessionId)}`);
            onDatabaseChanged?.();
        } catch (err) {
            const message = err instanceof Error ? err.message : "Failed to delete session.";
            setBrainError(message);
            appendBrainLog(`[db] delete error: ${message}`);
        } finally {
            setBrainAnalyzing(false);
        }
    };


    const handleExportSession = () => {
        const sessionId = resolveAnalysisSessionId();
        if (!sessionId) {
            setBrainError("No saved session is available to export.");
            appendBrainLog("[export] blocked: no session id available");
            return;
        }

        appendBrainLog(`[export] opening JSON export for ${shortSessionId(sessionId)}`);
        window.open(`${getApiBaseUrl()}/data/can/session/${sessionId}/export?format=json`, "_blank", "noopener,noreferrer");
    };

    const handleRunCurrentStep = async () => {
        setBusy(true);
        setError(null);
        setActivePanel("game");

        try {
            const sessionId = await ensureSession();
            await runStep(displayStep ?? undefined);
            if (autoAnalyze) {
                await handleQuickAnalyze(sessionId, "step-complete");
            }
            onDatabaseChanged?.();
        } catch (err) {
            setError(
                err instanceof Error
                    ? err.message
                    : "Failed to run selected Signal Recon step.",
            );
        } finally {
            setBusy(false);
        }
    };

    const handleRunMission = async () => {
        setBusy(true);
        setError(null);
        setActivePanel("game");

        try {
            const sessionId = await ensureSession();
            await runSelectedMission();
            if (autoAnalyze) {
                await handleQuickAnalyze(sessionId, "mission-complete");
            }
            onDatabaseChanged?.();
        } catch (err) {
            setError(
                err instanceof Error
                    ? err.message
                    : "Failed to run Signal Recon mission.",
            );
        } finally {
            setBusy(false);
        }
    };

    const handleCancelRun = () => {
        cancelActiveRun();
        setBusy(false);
        setActivePanel("game");
    };

    const handleStopSession = async () => {
        setBusy(true);
        setError(null);

        try {
            if (activeRunId) cancelActiveRun();
            const sessionId = activeSessionId;
            if (sessionId) {
                setLastAnalyzedSessionId(sessionId);
                await stopSession({ ui_event: "mission_terminal_closed" });
            }
            onExit?.();
        } catch (err) {
            setError(
                err instanceof Error
                    ? err.message
                    : "Failed to stop Signal Recon session.",
            );
        } finally {
            setBusy(false);
        }
    };

    const handleSelectStep = (index: number) => {
        if (isRunning || busy) return;
        selectStepByIndex(index);
        setActivePanel("game");
    };

    if (!selectedMission) {
        return (
            <div className="grid h-full place-items-center rounded-2xl bg-[#020617] p-4 font-mono text-green-100">
                <div className="rounded-2xl border border-yellow-300/30 bg-yellow-500/10 p-6 text-yellow-100">
                    No Signal Recon mission is selected.
                </div>
            </div>
        );
    }

    const renderGamePanel = () => (
        <div className="grid h-full min-h-0 place-items-center overflow-hidden px-2 py-2 text-center sm:px-6">
            <div className="w-full max-w-3xl align-center items-center text-center">
                {activePhase === "baseline" && (
                    <>
                        <p className="text-[10px] tracking-[0.3em] text-cyan-300 sm:text-xs">
                            {phaseLabel(activePhase)}
                        </p>
                        <h3 className="text-4xl font-black text-green-100 sm:text-6xl">
                            DO NOTHING
                        </h3>
                        <p className="text-sm text-slate-300 sm:text-base">
                            Hold still. Capturing quiet CAN baseline before this action.
                        </p>
                    </>
                )}

                {activePhase === "countdown" && (
                    <>
                        <p className="text-[10px] tracking-[0.3em] text-yellow-300 sm:text-xs">
                            {phaseLabel(activePhase)}
                        </p>
                        <h3 className="text-7xl font-black text-yellow-100 sm:text-6xl">
                            {countdownNumber}
                        </h3>
                        <p className="text-sm font-black text-green-100 sm:text-base">
                            {displayStep?.label}
                        </p>
                    </>
                )}

                {activePhase === "action" && (
                    <>
                        <p className="text-[10px] tracking-[0.3em] text-red-300 sm:text-xs">
                            {phaseLabel(activePhase)}
                        </p>

                        <h3 className="text-4xl font-black text-red-100 sm:text-6xl rounded-lg border border-red-300/60 bg-red-500/20 px-4 shadow-2xl shadow-red-500/20 ">
                            {displayStep?.action_text ?? displayStep?.label ?? "ACTION NOW"}
                        </h3>


                        <p className="text-sm text-slate-400 sm:text-base">
                            Marker posted. Perform only the requested action.
                        </p>
                    </>
                )}

                {activePhase === "capture" && (
                    <>
                        <p className=" text-[10px] tracking-[0.3em] text-green-300 sm:text-xs">
                            {phaseLabel(activePhase)}
                        </p>
                        <h3 className="text-4xl font-black text-green-100 sm:text-6xl   ">
                            HOLD STILL
                        </h3>
                        <p className="text-sm text-slate-300 sm:text-base">
                            Capturing CAN response after the action window.
                        </p>
                    </>
                )}

                {(activePhase === "idle" ||
                    activePhase === "complete" ||
                    activePhase === "cancelled") && (
                        <>
                            <p className="text-[10px] tracking-[0.3em] text-yellow-300 sm:text-xs">
                                {phaseLabel(activePhase)}
                            </p>
                            <h3 className="text-4xl font-black text-green-100 sm:text-6xl">
                                {activePhase === "idle" ? "READY" : formatPhase(activePhase)}
                            </h3>
                            <p className="mx-auto max-w-xl text-sm text-slate-300 sm:text-base">
                                {displayStep
                                    ? (displayStep.instruction ??
                                        "Run the selected capture step when ready.")
                                    : "Choose a step or run the full mission sequence."}
                            </p>
                        </>
                    )}

                <div className="mt-1 h-3 overflow-hidden rounded-full bg-slate-800">
                    <div
                        className={`h-full rounded-full transition-all ${activePhase === "action" ? "bg-red-400" : "bg-yellow-300"}`}
                        style={{ width: `${phaseProgress * 100}%` }}
                    />
                </div>

                <div className="mt-1 flex items-center justify-between gap-3 text-[11px] text-slate-500">
                    <span>
                        STEP {activeStepNumber} / {steps.length}
                    </span>
                    <span>
                        {phaseEndsAt !== null
                            ? `remaining ${formatMs(Math.ceil(timeRemainingMs))}`
                            : formatPhase(activePhase)}
                    </span>
                </div>
            </div>
        </div>
    );

    const renderStepsPanel = () => (
        <div className="h-full min-h-0 overflow-y-auto p-3 sm:p-5">
            <div className="mb-3 flex items-center justify-between text-xs">
                <span className="text-yellow-300">MISSION STEPS</span>
                <span className="text-slate-400">
                    STEP {activeStepNumber} / {steps.length}
                </span>
            </div>

            <div className="mb-4 h-3 overflow-hidden rounded-full bg-slate-800">
                <div
                    className="h-full rounded-full bg-green-400 transition-all"
                    style={{ width: `${missionProgress * 100}%` }}
                />
            </div>

            <div className="space-y-2 pr-1">
                {steps.map((step, index) => {
                    const selected = displayStep?.id === step.id;
                    const source = getStepSource(step);

                    return (
                        <GameButton
                            key={step.id}
                            disabled={isRunning || busy}
                            onPress={() => handleSelectStep(index)}
                            className={`w-full rounded-xl border p-3 text-left transition disabled:cursor-not-allowed disabled:opacity-40 ${selected
                                ? "border-green-300 bg-green-500/15 text-green-100"
                                : "border-slate-700 bg-slate-900/80 text-slate-300 hover:bg-slate-800"
                                }`}
                        >
                            <div className="flex items-center justify-between gap-3">
                                <span className="font-bold">{step.label}</span>
                                <span className="text-[10px] text-slate-500">
                                    {formatMs(getStepTotalMs(step))}
                                </span>
                            </div>
                            <p className="mt-1 text-[11px] text-slate-500">
                                {step.step_code}
                                {source ? ` · ${source}` : ""}
                            </p>
                        </GameButton>
                    );
                })}
            </div>
        </div>
    );

    const renderDetailsPanel = () => (
        <div className="h-full min-h-0 space-y-4 overflow-y-auto p-3 sm:p-5">
            <div className="rounded-xl border border-green-400/20 bg-slate-950/80 p-4">
                <div className="mb-3 flex items-center justify-between text-xs">
                    <span className="text-yellow-300">ACTIVE STEP</span>
                    <span className="text-slate-500">
                        {displayStep?.step_code ?? "none"}
                    </span>
                </div>

                {displayStep ? (
                    <div className="space-y-3 text-sm text-slate-300">
                        <h3 className="text-2xl font-black text-green-100">
                            {displayStep.label}
                        </h3>
                        {selectedStepSource && (
                            <p className="text-cyan-300">sub-mission: {selectedStepSource}</p>
                        )}
                        <p>
                            {displayStep.instruction ?? "Follow the selected mission prompt."}
                        </p>
                        <div className="grid grid-cols-2 gap-2 text-xs text-slate-500 sm:grid-cols-4">
                            <p>baseline: {formatMs(displayStep.baseline_ms ?? 0)}</p>
                            <p>countdown: {formatMs(displayStep.countdown_ms ?? 0)}</p>
                            <p>action: {formatMs(displayStep.action_ms ?? 0)}</p>
                            <p>capture: {formatMs(displayStep.capture_ms ?? 0)}</p>
                        </div>
                    </div>
                ) : (
                    <p className="text-sm text-slate-500">No step selected.</p>
                )}
            </div>

            <div className="rounded-xl border border-green-400/20 bg-slate-950/80 p-4 text-sm text-slate-300">
                <p className="mb-1 text-xs text-yellow-300">MISSION</p>
                <h3 className="text-xl font-black text-green-100">
                    {selectedMission.title}
                </h3>
                <p className="mt-2 text-slate-400">target: {selectedMission.target}</p>
                <p className="text-slate-500">code: {selectedMission.mission_code}</p>
            </div>
        </div>
    );

    const renderSessionPanel = () => (
        <div className="h-full min-h-0 space-y-3 overflow-y-auto p-3 text-sm sm:p-5">
            {(error || mlError) && (
                <div className="rounded-xl border border-red-300/40 bg-red-500/10 p-3 text-red-100">
                    {mlError ?? error}
                </div>
            )}

            <div className="rounded-xl border border-green-400/20 bg-slate-950/80 p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                    <div>
                        <p className="text-xs text-yellow-300">SESSION BROWSER</p>
                        <p className="text-[11px] text-slate-500">
                            {sessionHistory.length} saved run{sessionHistory.length === 1 ? "" : "s"} for {selectedMission.mission_code}
                        </p>
                    </div>
                    <GameButton
                        onPress={() => onDatabaseChanged?.()}
                        disabled={brainAnalyzing}
                        className="rounded-lg border border-cyan-300/40 bg-cyan-500/10 px-3 py-2 text-xs font-bold text-cyan-100 hover:bg-cyan-400/20 disabled:opacity-40"
                    >
                        REFRESH
                    </GameButton>
                </div>

                <div className="space-y-2">
                    {sessionHistory.map((session) => {
                        const selected = latestSessionId === session.session_id;
                        const empty = session.frame_count <= 0;
                        return (
                            <div
                                key={session.session_id}
                                className={`rounded-xl border p-3 ${selected
                                    ? "border-green-300/60 bg-green-500/10"
                                    : empty
                                        ? "border-red-300/30 bg-red-500/5"
                                        : "border-slate-700 bg-slate-900/70"
                                }`}
                            >
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <span className="font-black text-green-100">{shortSessionId(session.session_id)}</span>
                                            <span className={`rounded border px-1.5 py-0.5 text-[9px] font-black ${empty
                                                ? "border-red-300/40 text-red-200"
                                                : session.analyzed
                                                    ? "border-green-300/40 text-green-200"
                                                    : "border-yellow-300/40 text-yellow-200"
                                            }`}>
                                                {empty ? "EMPTY" : session.status.toUpperCase()}
                                            </span>
                                            <span className="rounded border border-cyan-300/30 px-1.5 py-0.5 text-[9px] text-cyan-200">
                                                {session.bus_interface}/{session.bus_mode}
                                            </span>
                                        </div>
                                        <p className="mt-1 text-[11px] text-slate-500">{formatSessionDate(session.started_at)}</p>
                                        <p className="mt-1 text-xs text-slate-300">
                                            {session.frame_count.toLocaleString()} frames · {session.marker_count} markers
                                            {session.top_can_id_hex ? ` · top ${session.top_can_id_hex}` : ""}
                                            {typeof session.confidence === "number" ? ` ${Math.round(session.confidence * 100)}%` : ""}
                                        </p>
                                    </div>

                                    <div className="flex flex-wrap gap-1">
                                        <GameButton
                                            onPress={() => void handleSelectSavedSession(session, false)}
                                            disabled={brainAnalyzing || Boolean(activeSessionId)}
                                            className="rounded-lg border border-green-300/40 bg-green-500/10 px-2 py-1 text-[10px] font-bold text-green-100 hover:bg-green-400/20 disabled:opacity-40"
                                        >
                                            SELECT
                                        </GameButton>
                                        <GameButton
                                            onPress={() => void handleSelectSavedSession(session, true)}
                                            disabled={brainAnalyzing || Boolean(activeSessionId) || !session.analyzed}
                                            className="rounded-lg border border-cyan-300/40 bg-cyan-500/10 px-2 py-1 text-[10px] font-bold text-cyan-100 hover:bg-cyan-400/20 disabled:opacity-40"
                                        >
                                            RESULTS
                                        </GameButton>
                                        <GameButton
                                            onPress={() => void handleQuickAnalyze(session.session_id, "manual")}
                                            disabled={brainAnalyzing || Boolean(activeSessionId) || empty}
                                            className="rounded-lg border border-yellow-300/40 bg-yellow-500/10 px-2 py-1 text-[10px] font-bold text-yellow-100 hover:bg-yellow-400/20 disabled:opacity-40"
                                        >
                                            ANALYZE
                                        </GameButton>
                                        <GameButton
                                            onPress={() => window.open(`${getApiBaseUrl()}/data/can/session/${session.session_id}/export?format=json`, "_blank", "noopener,noreferrer")}
                                            disabled={empty}
                                            className="rounded-lg border border-slate-500 bg-slate-800 px-2 py-1 text-[10px] font-bold text-slate-200 hover:bg-slate-700 disabled:opacity-40"
                                        >
                                            EXPORT
                                        </GameButton>
                                        <GameButton
                                            onPress={() => void handleDeleteSession(session.session_id)}
                                            disabled={brainAnalyzing || isRunning || activeSessionId === session.session_id}
                                            className="rounded-lg border border-red-300/40 bg-red-500/10 px-2 py-1 text-[10px] font-bold text-red-100 hover:bg-red-400/20 disabled:opacity-40"
                                        >
                                            DELETE
                                        </GameButton>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                    {!sessionHistory.length && (
                        <div className="rounded-xl border border-slate-700 bg-slate-900/70 p-4 text-slate-500">
                            No saved sessions for this mission and capture scope.
                        </div>
                    )}
                </div>
            </div>

            <div className="rounded-xl border border-cyan-400/20 bg-cyan-500/10 p-4 text-cyan-100">
                <p className="mb-3 text-xs text-cyan-200">SELECTED SESSION</p>
                <div className="grid gap-2 text-xs text-slate-300 sm:grid-cols-3">
                    <p>session: <span className="text-slate-500">{shortSessionId(latestSessionId)}</span></p>
                    <p>scope: <span className="text-slate-500">{reviewBusInterface}/{reviewBusMode}</span></p>
                    <p>capture: <span className="text-slate-500">{reviewCaptureKind}</span></p>
                    <p>AI result: <span className="text-yellow-300">{confidenceSummary}</span></p>
                    <p>frames: <span className="text-slate-500">{brainAnalysis?.frames_analyzed ?? selectedSessionSummary?.frame_count ?? 0}</span></p>
                    <p>ML labels: <span className="text-slate-500">{Object.keys(mlLabels).length}</span></p>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-6">
                    <GameButton onPress={() => void handleFullAnalyze(undefined, "manual")} disabled={brainAnalyzing || !resolveAnalysisSessionId()} className="rounded-lg border border-cyan-300/40 bg-cyan-500/10 px-3 py-2 text-xs font-bold text-cyan-100 hover:bg-cyan-400/20 disabled:opacity-40">{brainAnalyzing ? "ANALYZING" : "ANALYZE"}</GameButton>
                    <GameButton onPress={() => void handleExplainWithLlm()} disabled={brainAnalyzing || !resolveAnalysisSessionId()} className="rounded-lg border border-purple-300/40 bg-purple-500/10 px-3 py-2 text-xs font-bold text-purple-100 hover:bg-purple-400/20 disabled:opacity-40">EXPLAIN</GameButton>
                    <GameButton onPress={() => void handleLoadLatestAnalysis(undefined, true)} disabled={brainAnalyzing || !resolveAnalysisSessionId()} className="rounded-lg border border-green-300/40 bg-green-500/10 px-3 py-2 text-xs font-bold text-green-100 hover:bg-green-400/20 disabled:opacity-40">RESULTS</GameButton>
                    <GameButton onPress={() => void refreshMlContext()} disabled={mlLoading || !resolveAnalysisSessionId()} className="rounded-lg border border-purple-300/40 bg-purple-500/10 px-3 py-2 text-xs font-bold text-purple-100 hover:bg-purple-400/20 disabled:opacity-40">{mlLoading ? "ML..." : "ML STATUS"}</GameButton>
                    <GameButton onPress={handleExportSession} disabled={!resolveAnalysisSessionId()} className="rounded-lg border border-slate-500 bg-slate-800 px-3 py-2 text-xs font-bold text-slate-200 hover:bg-slate-700 disabled:opacity-40">EXPORT</GameButton>
                    <GameButton onPress={() => void handleDeleteSession()} disabled={brainAnalyzing || isRunning || !resolveAnalysisSessionId() || Boolean(activeSessionId)} className="rounded-lg border border-red-300/40 bg-red-500/10 px-3 py-2 text-xs font-bold text-red-100 hover:bg-red-400/20 disabled:opacity-40">DELETE</GameButton>
                </div>
            </div>
        </div>
    );


    return (
        <div className="relative flex h-full min-h-0 w-full flex-col overflow-hidden rounded-2xl bg-[#020617] text-green-100">
            <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(34,197,94,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(34,197,94,0.05)_1px,transparent_1px)] bg-[size:32px_32px]" />

            <div className="relative z-10 flex h-full min-h-0 w-full flex-col overflow-hidden font-mono">
                <div className="shrink-0 border-b border-green-400/20 px-2 py-2 sm:px-3">
                    <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                            <div className="flex items-center gap-2 text-[10px] text-yellow-300 sm:text-xs">
                                <span>{selectedMission.mission_code}</span>
                                <span className="text-slate-600">/</span>
                                <span className="truncate text-slate-400">
                                    {selectedInterface} · {busSafetyLabel}
                                </span>
                            </div>
                            <p className="truncate text-base font-black text-green-100 sm:text-lg">
                                {selectedMission.title}
                            </p>
                            <p className="truncate text-[11px] text-slate-500 sm:text-xs">
                                {displayStep?.label ?? selectedMission.target} · {vehicleSlug} · {confidenceSummary}
                            </p>
                        </div>

                        <div className="flex shrink-0 flex-col items-end gap-1 text-right">
                            <div className="flex flex-wrap items-center justify-end gap-1 sm:gap-2">
                                <GameButton
                                    onPress={() => {
                                        if (!brainAnalysis && activeSessionId) {
                                            void handleQuickAnalyze(undefined, "manual");
                                        } else {
                                            setBrainOpen(true);
                                        }
                                    }}
                                    disabled={brainAnalyzing || (!activeSessionId && !brainAnalysis)}
                                    className="rounded-lg border border-cyan-300/40 bg-cyan-500/10 px-2 py-1 text-[10px] font-bold text-cyan-100 hover:bg-cyan-400/20 disabled:cursor-not-allowed disabled:opacity-40 sm:text-xs"
                                >
                                    {brainAnalyzing ? "AI..." : "QUICK ID"}
                                </GameButton>

                                <GameButton
                                    onPress={() => setUseLlm((value) => !value)}
                                    disabled={isRunning || brainAnalyzing}
                                    className={`rounded-lg border px-2 py-1 text-[10px] font-bold disabled:cursor-not-allowed disabled:opacity-40 sm:text-xs ${useLlm
                                        ? "border-green-300/40 bg-green-500/10 text-green-100 hover:bg-green-400/20"
                                        : "border-slate-600 bg-slate-900/80 text-slate-400 hover:bg-slate-800"
                                        }`}
                                >
                                    LLM {useLlm ? "ON" : "OFF"}
                                </GameButton>

                                {isRunning ? (
                                    <GameButton
                                        onPress={handleCancelRun}
                                        className="rounded-lg border border-red-300/40 bg-red-500/10 px-2 py-1 text-xs font-bold text-red-100 hover:bg-red-400/20 sm:px-2 sm:py-1 sm:text-xm"
                                    >
                                        CANCEL
                                    </GameButton>
                                ) : (
                                    <GameButton
                                        onPress={handleStopSession}
                                        disabled={busy}
                                        className="rounded-lg border border-red-300/40 bg-red-500/10 px-2 py-1 text-xs font-bold text-red-100 hover:bg-red-400/20 disabled:cursor-not-allowed disabled:opacity-40 sm:px-2 sm:py-1 sm:text-xm"
                                    >
                                        {activeSessionId ? "END" : "QUEUE"}
                                    </GameButton>
                                )}

                                <span className="rounded-lg border border-green-300/40 bg-green-500/10 px-2 py-1 text-[10px] font-bold text-green-100 sm:px-2 sm:py-1 sm:text-xs">
                                    {formatPhase(activePhase)}
                                </span>
                            </div>

                            <span className="max-w-[120px] truncate text-[10px] text-slate-500 sm:max-w-[220px]">
                                {shortSessionId(latestSessionId)}
                            </span>
                        </div>
                    </div>

                    <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-800">
                        <div
                            className="h-full rounded-full bg-green-400 transition-all"
                            style={{ width: `${missionProgress * 100}%` }}
                        />
                    </div>

                    <div className="mt-1 grid grid-cols-4 gap-1 sm:gap-2">
                        {PANELS.map((panel) => (
                            <GameButton
                                key={panel.id}
                                disabled={isRunning && panel.id !== "game"}
                                onPress={() => setActivePanel(panel.id)}
                                className={`rounded-lg border px-1.5 py-1 text-[9px] font-bold transition disabled:cursor-not-allowed disabled:opacity-30 sm:px-2 sm:text-xs ${activePanel === panel.id
                                    ? "border-green-300 bg-green-500/20 text-green-100"
                                    : "border-slate-700 bg-slate-900/80 text-slate-400 hover:bg-slate-800"
                                    }`}
                            >
                                {panel.label}
                            </GameButton>
                        ))}
                    </div>

                    {error && (
                        <div className="mt-1 rounded-xl border border-red-300/40 bg-red-500/10 p-2 text-xs text-red-100">
                            {error}
                        </div>
                    )}
                </div>

                <div className="relative min-h-0 flex-1 overflow-hidden">
                    {activePanel === "game" && renderGamePanel()}
                    {activePanel === "steps" && renderStepsPanel()}
                    {activePanel === "details" && renderDetailsPanel()}
                    {activePanel === "session" && renderSessionPanel()}
                </div>

                <div className="shrink-0 border-t border-green-400/20 bg-black/40 p-2 sm:px-2 sm:py-1">
                    <div className="mb-2 grid grid-cols-2 gap-2 sm:hidden">
                        <GameButton
                            onPress={goBack}
                            disabled={!canGoBack}
                            className="rounded-xl border border-slate-600 bg-slate-900 px-3 py-2 text-xs font-bold text-slate-200 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-30"
                        >
                            ◀ BACK
                        </GameButton>
                        <GameButton
                            onPress={goForward}
                            disabled={!canGoForward}
                            className="rounded-xl border border-slate-600 bg-slate-900 px-3 py-2 text-xs font-bold text-slate-200 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-30"
                        >
                            NEXT ▶
                        </GameButton>
                    </div>

                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                        {isRunning ? (
                            <GameButton
                                onPress={handleCancelRun}
                                className="rounded-lg border border-red-300/40 bg-red-500/10 px-3 py-2 text-xs font-bold text-red-100 hover:bg-red-400/20 sm:px-2 sm:py-1 sm:text-sm"
                            >
                                CANCEL
                            </GameButton>
                        ) : (
                            <GameButton
                                onPress={handleStopSession}
                                disabled={busy}
                                className="rounded-lg border border-red-300/40 bg-red-500/10 px-3 py-2 text-xs font-bold text-red-100 hover:bg-red-400/20 disabled:cursor-not-allowed disabled:opacity-40 sm:px-2 sm:py-1 sm:text-sm"
                            >
                                END
                            </GameButton>
                        )}

                        <GameButton
                            onPress={handleRunCurrentStep}
                            disabled={busy || isRunning || !displayStep}
                            className="rounded-lg border border-yellow-300/40 bg-yellow-500/10 px-3 py-2 text-xs font-bold text-yellow-100 hover:bg-yellow-400/20 disabled:cursor-not-allowed disabled:opacity-40 sm:px-2 sm:py-1 sm:text-sm"
                        >
                            RUN STEP
                        </GameButton>

                        <GameButton
                            onPress={handleRunMission}
                            disabled={busy || isRunning || steps.length === 0}
                            className="rounded-lg border border-green-300/40 bg-green-500/10 px-3 py-2 text-xs font-bold text-green-100 hover:bg-green-400/20 disabled:cursor-not-allowed disabled:opacity-40 sm:px-2 sm:py-1 sm:text-sm"
                        >
                            RUN ALL
                        </GameButton>

                        <GameButton
                            onPress={() => void handleQuickAnalyze(undefined, "manual")}
                            disabled={brainAnalyzing || !activeSessionId}
                            className="rounded-lg border border-cyan-300/40 bg-cyan-500/10 px-3 py-2 text-xs font-bold text-cyan-100 hover:bg-cyan-400/20 disabled:cursor-not-allowed disabled:opacity-40 sm:px-2 sm:py-1 sm:text-sm"
                        >
                            {brainAnalyzing ? "AI..." : "QUICK ID"}
                        </GameButton>

                        <GameButton
                            onPress={onExit}
                            disabled={busy || isRunning}
                            className="rounded-lg border border-cyan-300/40 bg-cyan-500/10 px-3 py-2 text-xs font-bold text-cyan-100 hover:bg-cyan-400/20 disabled:cursor-not-allowed disabled:opacity-40 sm:px-2 sm:py-1 sm:text-sm"
                        >
                            QUEUE
                        </GameButton>
                    </div>
                </div>
            </div>

            <SignalReconBrainConsole
                open={brainOpen}
                analyzing={brainAnalyzing}
                error={brainError}
                analysis={brainAnalysis}
                logs={brainLogs}
                sessionId={latestSessionId}
                missionCode={selectedMission.mission_code}
                missionTitle={selectedMission.title}
                signalName={selectedMission.target}
                vehicleSlug={vehicleSlug}
                busInterface={reviewBusInterface}
                busMode={reviewBusMode}
                sourceLabel={reviewSourceLabel}
                useLlm={useLlm}
                useEmbeddings={useEmbeddings}
                autoAnalyze={autoAnalyze}
                mlLabels={mlLabels}
                mlReadiness={mlReadiness}
                activeModel={activeModel}
                mlLoading={mlLoading}
                labelingCandidateId={labelingCandidateId}
                onClose={() => setBrainOpen(false)}
                onAnalyze={() => void handleQuickAnalyze(undefined, "manual")}
                onExplainWithLlm={() => void handleExplainWithLlm()}
                onLoadLatest={() => void handleLoadLatestAnalysis(undefined, true)}
                onRefreshMl={() => void refreshMlContext()}
                onLabelCandidate={handleLabelCandidate}
                onToggleLlm={() => setUseLlm((value) => !value)}
                onToggleEmbeddings={() => setUseEmbeddings((value) => !value)}
                onToggleAutoAnalyze={() => setAutoAnalyze((value) => !value)}
                onExportSession={handleExportSession}
                onDeleteSession={() => void handleDeleteSession()}
            />
        </div>
    );
}