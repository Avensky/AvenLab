import { useEffect, useMemo, useState } from "react";
import { GameButton } from "../../components/GameButton";
import { useCanBusStore } from "../../store/canBusStore";
import { useSignalReconStore, type ReconStep } from "../../store/signalReconStore";
import { getStepTotalMs } from "../../store/signalReconMissions";

type SignalReconMissionProps = {
    onExit?: () => void;
};

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

    useEffect(() => {
        const id = window.setInterval(() => setNow(performance.now()), 50);
        return () => window.clearInterval(id);
    }, []);

    const isRunning = Boolean(activeRunId);
    const displayStep = activeStep ?? steps[activeStepIndex] ?? null;
    const selectedStepSource = getStepSource(displayStep);

    const phaseDuration = useMemo(() => {
        if (phaseStartedAt === null || phaseEndsAt === null) return 1;
        return Math.max(phaseEndsAt - phaseStartedAt, 1);
    }, [phaseEndsAt, phaseStartedAt]);

    const phaseElapsed = phaseStartedAt === null ? 0 : Math.max(now - phaseStartedAt, 0);
    const phaseProgress = phaseEndsAt === null ? 0 : Math.min(phaseElapsed / phaseDuration, 1);
    const timeRemainingMs = phaseEndsAt === null ? 0 : Math.max(phaseEndsAt - now, 0);

    const countdownNumber = activePhase === "countdown"
        ? Math.max(1, Math.ceil(timeRemainingMs / 1000))
        : null;

    const missionProgress = steps.length
        ? Math.min(
            1,
            (activeStepIndex + (activePhase === "complete" ? 1 : phaseProgress)) / steps.length
        )
        : 0;

    const ensureSession = async () => {
        if (activeSessionId) return activeSessionId;
        return startSession({ busInterface: selectedInterface, busMode: selectedMode });
    };

    const handleRunCurrentStep = async () => {
        setBusy(true);
        setError(null);

        try {
            await ensureSession();
            await runStep(displayStep ?? undefined);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to run selected Signal Recon step.");
        } finally {
            setBusy(false);
        }
    };

    const handleRunMission = async () => {
        setBusy(true);
        setError(null);

        try {
            await ensureSession();
            await runSelectedMission();
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to run Signal Recon mission.");
        } finally {
            setBusy(false);
        }
    };

    const handleCancelRun = () => {
        cancelActiveRun();
        setBusy(false);
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
            setError(err instanceof Error ? err.message : "Failed to stop Signal Recon session.");
        } finally {
            setBusy(false);
        }
    };

    if (!selectedMission) {
        return (
            <div className="grid h-full place-items-center rounded-2xl bg-[#020617] p-6 font-mono text-green-100">
                <div className="rounded-2xl border border-yellow-300/30 bg-yellow-500/10 p-6 text-yellow-100">
                    No Signal Recon mission is selected.
                </div>
            </div>
        );
    }

    return (
        <div className="relative h-full w-full overflow-hidden rounded-2xl bg-[#020617] text-green-100">
            <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(34,197,94,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(34,197,94,0.05)_1px,transparent_1px)] bg-[size:32px_32px]" />

            <div className="relative z-10 flex h-full w-full flex-col p-6 font-mono">
                <div className="mb-4 flex items-center justify-between border-b border-green-400/20 pb-3">
                    <div>
                        <p className="text-xs text-yellow-300">{selectedMission.mission_code}</p>
                        <h2 className="text-2xl font-black text-green-100">{selectedMission.title}</h2>
                        <p className="text-sm text-slate-400">target: {selectedMission.target}</p>
                    </div>

                    <div className="flex items-center gap-3">
                        <div className="hidden text-right text-xs text-slate-500 md:block">
                            <p>SESSION: {activeSessionId ? activeSessionId : "not started"}</p>
                            <p>{selectedInterface} / {selectedMode}</p>
                        </div>
                        <span className="rounded-lg border border-green-300/40 bg-green-500/10 px-3 py-2 text-xs font-bold text-green-100">
                            {formatPhase(activePhase)}
                        </span>
                    </div>
                </div>

                {error && (
                    <div className="mb-4 rounded-xl border border-red-300/40 bg-red-500/10 p-3 text-sm text-red-100">
                        {error}
                    </div>
                )}

                <div className="mb-5 grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
                    <div className="rounded-xl border border-green-400/20 bg-slate-950/80 p-4">
                        <div className="mb-3 flex items-center justify-between text-xs">
                            <span className="text-yellow-300">MISSION STEPS</span>
                            <span className="text-slate-400">
                                STEP {steps.length ? Math.min(activeStepIndex + 1, steps.length) : 0} / {steps.length}
                            </span>
                        </div>

                        <div className="mb-3 h-3 overflow-hidden rounded-full bg-slate-800">
                            <div
                                className="h-full rounded-full bg-green-400 transition-all"
                                style={{ width: `${missionProgress * 100}%` }}
                            />
                        </div>

                        <div className="max-h-[220px] space-y-2 overflow-y-auto pr-1">
                            {steps.map((step, index) => {
                                const selected = displayStep?.id === step.id;
                                const source = getStepSource(step);

                                return (
                                    <GameButton
                                        key={step.id}
                                        disabled={isRunning || busy}
                                        onPress={() => selectStepByIndex(index)}
                                        className={`w-full rounded-xl border p-3 text-left transition disabled:cursor-not-allowed disabled:opacity-40 ${selected
                                            ? "border-green-300 bg-green-500/15 text-green-100"
                                            : "border-slate-700 bg-slate-900/80 text-slate-300 hover:bg-slate-800"
                                            }`}
                                    >
                                        <div className="flex items-center justify-between gap-3">
                                            <span className="font-bold">{step.label}</span>
                                            <span className="text-[10px] text-slate-500">{formatMs(getStepTotalMs(step))}</span>
                                        </div>
                                        {source && <p className="mt-1 text-[11px] text-slate-500">{source}</p>}
                                    </GameButton>
                                );
                            })}
                        </div>
                    </div>

                    <div className="rounded-xl border border-green-400/20 bg-slate-950/80 p-4">
                        <div className="mb-3 flex items-center justify-between text-xs">
                            <span className="text-yellow-300">ACTIVE STEP</span>
                            <span className="text-slate-500">
                                {displayStep?.step_code ?? "none"}
                            </span>
                        </div>

                        {displayStep ? (
                            <div className="space-y-3 text-sm text-slate-300">
                                <h3 className="text-xl font-black text-green-100">{displayStep.label}</h3>
                                {selectedStepSource && <p className="text-cyan-300">sub-mission: {selectedStepSource}</p>}
                                <p>{displayStep.instruction ?? "Follow the selected mission prompt."}</p>
                                <div className="grid grid-cols-2 gap-2 text-xs text-slate-500 md:grid-cols-4">
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
                </div>

                <div className="grid flex-1 place-items-center text-center">
                    <div className="w-full max-w-3xl">
                        {activePhase === "baseline" && (
                            <>
                                <p className="mb-2 text-xs tracking-[0.35em] text-cyan-300">
                                    {phaseLabel(activePhase)}
                                </p>
                                <h3 className="mb-4 text-4xl font-black text-green-100">DO NOTHING</h3>
                                <p className="text-slate-300">
                                    Hold still. Capturing quiet CAN baseline before this action.
                                </p>
                            </>
                        )}

                        {activePhase === "countdown" && (
                            <>
                                <p className="mb-2 text-xs tracking-[0.35em] text-yellow-300">
                                    {phaseLabel(activePhase)}
                                </p>
                                <div className="mb-4 text-8xl font-black text-yellow-100">
                                    {countdownNumber}
                                </div>
                                <h3 className="text-3xl font-black text-green-100">
                                    {displayStep?.label}
                                </h3>
                            </>
                        )}

                        {activePhase === "action" && (
                            <>
                                <p className="mb-2 text-xs tracking-[0.35em] text-red-300">
                                    {phaseLabel(activePhase)}
                                </p>

                                <div className="rounded-3xl border border-red-300/60 bg-red-500/20 px-8 py-16 shadow-2xl shadow-red-500/20">
                                    <h3 className="text-5xl font-black text-red-100">
                                        {displayStep?.action_text ?? displayStep?.label ?? "ACTION NOW"}
                                    </h3>
                                </div>

                                <p className="mt-5 text-sm text-slate-400">
                                    Store posted the action marker at the start of this phase.
                                </p>
                            </>
                        )}

                        {activePhase === "capture" && (
                            <>
                                <p className="mb-2 text-xs tracking-[0.35em] text-green-300">
                                    {phaseLabel(activePhase)}
                                </p>
                                <h3 className="mb-4 text-4xl font-black text-green-100">HOLD STILL</h3>
                                <p className="text-slate-300">
                                    Capturing CAN response after the action window.
                                </p>
                            </>
                        )}

                        {(activePhase === "idle" || activePhase === "complete" || activePhase === "cancelled") && (
                            <>
                                <p className="mb-2 text-xs tracking-[0.35em] text-yellow-300">
                                    {phaseLabel(activePhase)}
                                </p>
                                <h3 className="mb-4 text-4xl font-black text-green-100">
                                    {activePhase === "idle" ? "READY TO RECORD" : formatPhase(activePhase)}
                                </h3>
                                <p className="text-slate-300">
                                    Choose a step, run one capture, or run the full mission sequence.
                                </p>
                            </>
                        )}

                        <div className="mt-8 h-3 overflow-hidden rounded-full bg-slate-800">
                            <div
                                className={`h-full rounded-full transition-all ${activePhase === "action" ? "bg-red-400" : "bg-yellow-300"
                                    }`}
                                style={{ width: `${phaseProgress * 100}%` }}
                            />
                        </div>

                        {phaseEndsAt !== null && (
                            <p className="mt-2 text-xs text-slate-500">
                                phase remaining: {formatMs(Math.ceil(timeRemainingMs))}
                            </p>
                        )}
                    </div>
                </div>

                <div className="mt-6 grid gap-3 border-t border-green-400/20 pt-4 md:grid-cols-4">
                    {isRunning ? (
                        <GameButton
                            onPress={handleCancelRun}
                            className="rounded-xl border border-red-300/40 bg-red-500/10 px-5 py-3 font-bold text-red-100 hover:bg-red-400/20"
                        >
                            CANCEL RUN
                        </GameButton>
                    ) : (
                        <GameButton
                            onPress={handleStopSession}
                            disabled={busy}
                            className="rounded-xl border border-red-300/40 bg-red-500/10 px-5 py-3 font-bold text-red-100 hover:bg-red-400/20 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                            END SESSION
                        </GameButton>
                    )}

                    <GameButton
                        onPress={handleRunCurrentStep}
                        disabled={busy || isRunning || !displayStep}
                        className="rounded-xl border border-yellow-300/40 bg-yellow-500/10 px-5 py-3 font-bold text-yellow-100 hover:bg-yellow-400/20 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                        RUN STEP
                    </GameButton>

                    <GameButton
                        onPress={handleRunMission}
                        disabled={busy || isRunning || steps.length === 0}
                        className="rounded-xl border border-green-300/40 bg-green-500/10 px-5 py-3 font-bold text-green-100 hover:bg-green-400/20 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                        RUN FULL MISSION
                    </GameButton>

                    <GameButton
                        onPress={onExit}
                        disabled={busy || isRunning}
                        className="rounded-xl border border-cyan-300/40 bg-cyan-500/10 px-5 py-3 font-bold text-cyan-100 hover:bg-cyan-400/20 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                        BACK TO QUEUE
                    </GameButton>
                </div>
            </div>
        </div>
    );
}
