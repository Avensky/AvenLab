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
} from "./SignalReconBrainConsole";

type SignalReconMissionProps = {
    onExit?: () => void;
};

type MissionPanel = "game" | "steps" | "details" | "session";

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

export function SignalReconMission({ onExit }: SignalReconMissionProps) {
    const selectedMission = useSignalReconStore((s) => s.selectedMission);
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
    const [useLlm, setUseLlm] = useState(true);
    const [useEmbeddings, setUseEmbeddings] = useState(true);
    const [autoAnalyze, setAutoAnalyze] = useState(true);

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
        if (activeSessionId) return activeSessionId;
        return startSession({
            busInterface: selectedInterface,
            busMode: selectedMode,
        });
    };

    const appendBrainLog = (line: string) => {
        setBrainLogs((current) => [
            ...current,
            `${new Date().toLocaleTimeString()} ${line}`,
        ].slice(-80));
    };

    const handleAnalyzeSession = async (
        sessionIdOverride?: string,
        source: "manual" | "step-complete" | "mission-complete" = "manual",
    ) => {
        const sessionId =
            sessionIdOverride ??
            useSignalReconStore.getState().activeSessionId ??
            activeSessionId;

        setBrainOpen(true);

        if (!sessionId) {
            setBrainError("Start or record a session before running Pi Brain analysis.");
            appendBrainLog("[ai] blocked: no active session id");
            return;
        }

        setBrainAnalyzing(true);
        setBrainError(null);
        appendBrainLog(`[ai] ${source}: analyzing ${shortSessionId(sessionId)}`);
        appendBrainLog(
            `[ai] options: llm=${useLlm ? "on" : "off"} embeddings=${useEmbeddings ? "on" : "off"}`,
        );

        try {
            const res = await fetch(
                `${getApiBaseUrl()}/data/can/session/${sessionId}/analyze`,
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        marker_window_ms: 900,
                        use_llm: useLlm,
                        use_embeddings: useEmbeddings,
                        llm_model: "qwen2.5:3b",
                        embed_model: "nomic-embed-text",
                        persist: true,
                    }),
                },
            );

            const data = await res.json().catch(() => ({}));

            if (!res.ok || data.ok === false) {
                throw new Error(
                    typeof data.error === "string"
                        ? data.error
                        : "Pi Brain analysis failed.",
                );
            }

            const nextAnalysis = data as BrainAnalysisResult;
            setBrainAnalysis(nextAnalysis);
            appendBrainLog(
                `[ai] done: frames=${nextAnalysis.frames_analyzed} markers=${nextAnalysis.markers} candidates=${nextAnalysis.candidates.length}`,
            );
            appendBrainLog(
                `[llm] ${nextAnalysis.llm_available ? `on (${nextAnalysis.llm_model ?? "model unknown"})` : `off${nextAnalysis.llm_error ? `: ${nextAnalysis.llm_error}` : ""}`}`,
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

    const handleRunCurrentStep = async () => {
        setBusy(true);
        setError(null);
        setActivePanel("game");

        try {
            const sessionId = await ensureSession();
            await runStep(displayStep ?? undefined);
            if (autoAnalyze) {
                await handleAnalyzeSession(sessionId, "step-complete");
            }
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
                await handleAnalyzeSession(sessionId, "mission-complete");
            }
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
            if (activeSessionId) {
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
            {error && (
                <div className="rounded-xl border border-red-300/40 bg-red-500/10 p-3 text-red-100">
                    {error}
                </div>
            )}

            <div className="rounded-xl border border-green-400/20 bg-slate-950/80 p-4">
                <p className="mb-3 text-xs text-yellow-300">SESSION</p>
                <div className="grid gap-2 text-slate-300 sm:grid-cols-2">
                    <p>
                        id:{" "}
                        <span className="text-slate-500">
                            {shortSessionId(activeSessionId)}
                        </span>
                    </p>
                    <p>
                        phase:{" "}
                        <span className="text-slate-500">{formatPhase(activePhase)}</span>
                    </p>
                    <p>
                        interface:{" "}
                        <span className="text-slate-500">{selectedInterface}</span>
                    </p>
                    <p>
                        mode: <span className="text-slate-500">{selectedMode}</span>
                    </p>
                    <p>
                        steps: <span className="text-slate-500">{steps.length}</span>
                    </p>
                    <p>
                        mission progress:{" "}
                        <span className="text-slate-500">
                            {Math.round(missionProgress * 100)}%
                        </span>
                    </p>
                </div>
            </div>

            <div className="rounded-xl border border-cyan-400/20 bg-cyan-500/10 p-4 text-cyan-100">
                <p className="mb-3 text-xs text-cyan-200">PI BRAIN</p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <GameButton
                        onPress={() => void handleAnalyzeSession(undefined, "manual")}
                        disabled={brainAnalyzing || !activeSessionId}
                        className="rounded-lg border border-cyan-300/40 bg-cyan-500/10 px-3 py-2 text-xs font-bold text-cyan-100 hover:bg-cyan-400/20 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                        {brainAnalyzing ? "ANALYZING" : "ANALYZE"}
                    </GameButton>
                    <GameButton
                        onPress={() => setBrainOpen(true)}
                        disabled={!brainAnalysis && !brainError}
                        className="rounded-lg border border-green-300/40 bg-green-500/10 px-3 py-2 text-xs font-bold text-green-100 hover:bg-green-400/20 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                        RESULTS
                    </GameButton>
                    <GameButton
                        onPress={() => setUseLlm((value) => !value)}
                        disabled={isRunning || brainAnalyzing}
                        className={`rounded-lg border px-3 py-2 text-xs font-bold disabled:cursor-not-allowed disabled:opacity-40 ${useLlm
                            ? "border-green-300/40 bg-green-500/10 text-green-100 hover:bg-green-400/20"
                            : "border-slate-600 bg-slate-900 text-slate-400 hover:bg-slate-800"
                            }`}
                    >
                        LLM {useLlm ? "ON" : "OFF"}
                    </GameButton>
                    <GameButton
                        onPress={() => setAutoAnalyze((value) => !value)}
                        disabled={isRunning || brainAnalyzing}
                        className={`rounded-lg border px-3 py-2 text-xs font-bold disabled:cursor-not-allowed disabled:opacity-40 ${autoAnalyze
                            ? "border-yellow-300/40 bg-yellow-500/10 text-yellow-100 hover:bg-yellow-400/20"
                            : "border-slate-600 bg-slate-900 text-slate-400 hover:bg-slate-800"
                            }`}
                    >
                        AUTO {autoAnalyze ? "ON" : "OFF"}
                    </GameButton>
                </div>
                <p className="mt-3 text-xs text-cyan-100/80">
                    AI analysis runs after each completed step/mission when AUTO is on.
                    LLM controls whether Ollama writes the explanation; probabilities still work with LLM off.
                </p>
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
                                    {selectedInterface} · {selectedMode}
                                </span>
                            </div>
                            <p className="truncate text-base font-black text-green-100 sm:text-lg">
                                {selectedMission.title}
                            </p>
                            <p className="truncate text-[11px] text-slate-500 sm:text-xs">
                                {displayStep?.label ?? selectedMission.target}
                            </p>
                        </div>

                        <div className="flex shrink-0 flex-col items-end gap-1 text-right">
                            <div className="flex flex-wrap items-center justify-end gap-1 sm:gap-2">
                                <GameButton
                                    onPress={() => {
                                        if (!brainAnalysis && activeSessionId) {
                                            void handleAnalyzeSession(undefined, "manual");
                                        } else {
                                            setBrainOpen(true);
                                        }
                                    }}
                                    disabled={brainAnalyzing || (!activeSessionId && !brainAnalysis)}
                                    className="rounded-lg border border-cyan-300/40 bg-cyan-500/10 px-2 py-1 text-[10px] font-bold text-cyan-100 hover:bg-cyan-400/20 disabled:cursor-not-allowed disabled:opacity-40 sm:text-xs"
                                >
                                    {brainAnalyzing ? "AI..." : "AI"}
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
                                        END
                                    </GameButton>
                                )}

                                <span className="rounded-lg border border-green-300/40 bg-green-500/10 px-2 py-1 text-[10px] font-bold text-green-100 sm:px-2 sm:py-1 sm:text-xs">
                                    {formatPhase(activePhase)}
                                </span>
                            </div>

                            <span className="max-w-[120px] truncate text-[10px] text-slate-500 sm:max-w-[220px]">
                                {shortSessionId(activeSessionId)}
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
                            onPress={() => void handleAnalyzeSession(undefined, "manual")}
                            disabled={brainAnalyzing || !activeSessionId}
                            className="rounded-lg border border-cyan-300/40 bg-cyan-500/10 px-3 py-2 text-xs font-bold text-cyan-100 hover:bg-cyan-400/20 disabled:cursor-not-allowed disabled:opacity-40 sm:px-2 sm:py-1 sm:text-sm"
                        >
                            {brainAnalyzing ? "AI..." : "AI"}
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
                sessionId={activeSessionId}
                missionCode={selectedMission.mission_code}
                missionTitle={selectedMission.title}
                useLlm={useLlm}
                useEmbeddings={useEmbeddings}
                autoAnalyze={autoAnalyze}
                onClose={() => setBrainOpen(false)}
                onAnalyze={() => void handleAnalyzeSession(undefined, "manual")}
                onToggleLlm={() => setUseLlm((value) => !value)}
                onToggleEmbeddings={() => setUseEmbeddings((value) => !value)}
                onToggleAutoAnalyze={() => setAutoAnalyze((value) => !value)}
            />
        </div>
    );
}
