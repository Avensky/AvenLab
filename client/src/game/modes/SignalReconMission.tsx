import { useEffect, useMemo, useRef, useState } from "react";

type Mission = {
    id: string;
    title: string;
    target: string;
    status: string;
};

type ReconStep = {
    id: string;
    label: string;
    instruction: string;
    actionText: string;
};

type DoorMethod = "driver_door" | "passenger_door" | "key_fob";

type ProtocolPhase =
    | "idle"
    | "baseline"
    | "countdown"
    | "action_now"
    | "capturing"
    | "complete";

const BASELINE_MS = 2000;
const COUNTDOWN_MS = 3000;
const ACTION_MS = 1800;
const CAPTURE_MS = 1500;

const DOOR_UNLOCK_STEPS: ReconStep[] = [
    {
        id: "unlock_press_once",
        label: "Unlock Once",
        instruction: "Prepare to press UNLOCK one time.",
        actionText: "PRESS UNLOCK ONCE",
    },
    {
        id: "unlock_press_twice",
        label: "Unlock Twice",
        instruction: "Prepare to press UNLOCK twice.",
        actionText: "PRESS UNLOCK TWICE",
    },
    {
        id: "lock_press_once",
        label: "Lock Once",
        instruction: "Prepare to press LOCK one time.",
        actionText: "PRESS LOCK ONCE",
    },
    {
        id: "lock_press_twice",
        label: "Lock Twice",
        instruction: "Prepare to press LOCK twice.",
        actionText: "PRESS LOCK TWICE",
    },
    {
        id: "unlock_repeat_1",
        label: "Unlock Repeat 1",
        instruction: "Prepare to press UNLOCK again.",
        actionText: "PRESS UNLOCK",
    },
    {
        id: "unlock_repeat_2",
        label: "Unlock Repeat 2",
        instruction: "Prepare for final UNLOCK repeat.",
        actionText: "PRESS UNLOCK AGAIN",
    },
];

const methodLabels: Record<DoorMethod, string> = {
    driver_door: "Driver Door Switch",
    passenger_door: "Passenger Door Switch",
    key_fob: "Key Fob",
};

async function postMarker(payload: unknown) {
    // Later replace this with your real aven-data-server endpoint.
    // Example: http://localhost:8001/can/session/{sessionId}/marker
    console.log("[signal marker]", payload);

    // await fetch("http://localhost:8001/can/marker", {
    //   method: "POST",
    //   headers: { "Content-Type": "application/json" },
    //   body: JSON.stringify(payload),
    // });
}

export function SignalReconMission({ mission }: { mission: Mission }) {
    const [active, setActive] = useState(false);
    const [method, setMethod] = useState<DoorMethod>("driver_door");
    const [stepIndex, setStepIndex] = useState(0);
    const [phase, setPhase] = useState<ProtocolPhase>("idle");
    const [phaseStartedAt, setPhaseStartedAt] = useState(0);
    const [now, setNow] = useState(performance.now());

    const [markers, setMarkers] = useState<
        {
            stepId: string;
            method: DoorMethod;
            phase: ProtocolPhase;
            frontendTs: number;
        }[]
    >([]);

    const actionMarkedRef = useRef(false);

    const steps = useMemo(() => {
        if (mission.target === "door_unlock") return DOOR_UNLOCK_STEPS;
        return [];
    }, [mission.target]);

    const step = steps[stepIndex];
    const complete = active && stepIndex >= steps.length;
    const totalProgress = steps.length ? stepIndex / steps.length : 0;

    const phaseElapsed = now - phaseStartedAt;

    const phaseDuration =
        phase === "baseline"
            ? BASELINE_MS
            : phase === "countdown"
                ? COUNTDOWN_MS
                : phase === "action_now"
                    ? ACTION_MS
                    : phase === "capturing"
                        ? CAPTURE_MS
                        : 1;

    const phaseProgress = Math.min(phaseElapsed / phaseDuration, 1);

    const countdownNumber =
        phase === "countdown"
            ? Math.max(1, Math.ceil((COUNTDOWN_MS - phaseElapsed) / 1000))
            : null;

    const beginPhase = (nextPhase: ProtocolPhase) => {
        setPhase(nextPhase);
        setPhaseStartedAt(performance.now());
    };

    const startSession = () => {
        setActive(true);
        setStepIndex(0);
        setMarkers([]);
        actionMarkedRef.current = false;
        beginPhase("baseline");
    };

    const stopSession = () => {
        setActive(false);
        setStepIndex(0);
        setPhase("idle");
        actionMarkedRef.current = false;
    };

    const markActionNow = async () => {
        if (!step || actionMarkedRef.current) return;

        actionMarkedRef.current = true;

        const marker = {
            missionId: mission.id,
            target: mission.target,
            stepId: step.id,
            method,
            phase: "action_now" as const,
            frontendTs: Date.now(),
        };

        setMarkers((prev) => [...prev, marker]);

        await postMarker({
            ...marker,
            event: "action_window_open",
            note: "Backend should store authoritative timestamp here.",
        });
    };

    useEffect(() => {
        if (!active) return;

        const id = window.setInterval(() => {
            setNow(performance.now());
        }, 50);

        return () => window.clearInterval(id);
    }, [active]);

    useEffect(() => {
        if (!active || complete || !step) return;

        if (phase === "baseline" && phaseElapsed >= BASELINE_MS) {
            beginPhase("countdown");
            return;
        }

        if (phase === "countdown" && phaseElapsed >= COUNTDOWN_MS) {
            beginPhase("action_now");
            return;
        }

        if (phase === "action_now") {
            markActionNow();

            if (phaseElapsed >= ACTION_MS) {
                beginPhase("capturing");
            }

            return;
        }

        if (phase === "capturing" && phaseElapsed >= CAPTURE_MS) {
            actionMarkedRef.current = false;

            if (stepIndex + 1 >= steps.length) {
                setStepIndex(steps.length);
                beginPhase("complete");
            } else {
                setStepIndex((i) => i + 1);
                beginPhase("baseline");
            }
        }
    }, [active, complete, step, phase, phaseElapsed, stepIndex, steps.length]);

    return (
        <div className="relative h-full w-full overflow-hidden rounded-2xl bg-[#020617] text-green-100">
            <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(34,197,94,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(34,197,94,0.05)_1px,transparent_1px)] bg-[size:32px_32px]" />

            <div className="relative z-10 flex h-full w-full flex-col p-6 font-mono">
                <div className="mb-4 flex items-center justify-between border-b border-green-400/20 pb-3">
                    <div>
                        <p className="text-xs text-yellow-300">{mission.id}</p>
                        <h2 className="text-2xl font-black text-green-100">
                            {mission.title}
                        </h2>
                        <p className="text-sm text-slate-400">target: {mission.target}</p>
                    </div>

                    <span className="rounded-lg border border-green-300/40 bg-green-500/10 px-3 py-2 text-xs font-bold text-green-100">
                        {active ? phase.toUpperCase() : "IDLE"}
                    </span>
                </div>

                {!active ? (
                    <div className="grid flex-1 place-items-center">
                        <div className="w-full max-w-xl rounded-2xl border border-green-400/20 bg-slate-950/80 p-6">
                            <h3 className="mb-3 text-xl font-bold text-yellow-300">
                                Select Door Test Method
                            </h3>

                            <div className="mb-6 grid gap-3">
                                {(Object.keys(methodLabels) as DoorMethod[]).map((key) => (
                                    <button
                                        key={key}
                                        onClick={() => setMethod(key)}
                                        className={`rounded-xl border px-4 py-4 text-left font-bold ${method === key
                                                ? "border-green-300 bg-green-500/15 text-green-100"
                                                : "border-slate-700 bg-slate-900 text-slate-300 hover:bg-slate-800"
                                            }`}
                                    >
                                        {methodLabels[key]}
                                    </button>
                                ))}
                            </div>

                            <button
                                onClick={startSession}
                                className="w-full rounded-xl border border-green-300/40 bg-green-500/10 px-5 py-5 text-lg font-black text-green-100 hover:bg-green-400/20"
                            >
                                START TIMED RECON SESSION
                            </button>
                        </div>
                    </div>
                ) : complete ? (
                    <div className="grid flex-1 place-items-center">
                        <div className="w-full max-w-xl rounded-2xl border border-green-300/30 bg-green-500/10 p-6 text-center">
                            <h3 className="mb-3 text-3xl font-black text-green-100">
                                MISSION COMPLETE
                            </h3>

                            <p className="mb-6 text-slate-300">
                                Captured {markers.length} action markers for{" "}
                                {methodLabels[method]}.
                            </p>

                            <button
                                onClick={stopSession}
                                className="rounded-xl border border-green-300/40 bg-green-500/10 px-6 py-4 font-bold text-green-100 hover:bg-green-400/20"
                            >
                                RETURN TO MISSION
                            </button>
                        </div>
                    </div>
                ) : (
                    <>
                        <div className="mb-6">
                            <div className="mb-2 flex items-center justify-between text-xs">
                                <span className="text-yellow-300">
                                    METHOD: {methodLabels[method]}
                                </span>
                                <span className="text-slate-400">
                                    STEP {Math.min(stepIndex + 1, steps.length)} / {steps.length}
                                </span>
                            </div>

                            <div className="h-4 overflow-hidden rounded-full bg-slate-800">
                                <div
                                    className="h-full rounded-full bg-green-400 transition-all"
                                    style={{ width: `${totalProgress * 100}%` }}
                                />
                            </div>
                        </div>

                        <div className="grid flex-1 place-items-center text-center">
                            <div className="w-full max-w-3xl">
                                {phase === "baseline" && (
                                    <>
                                        <p className="mb-2 text-xs tracking-[0.35em] text-cyan-300">
                                            BASELINE CAPTURE
                                        </p>
                                        <h3 className="mb-4 text-4xl font-black text-green-100">
                                            DO NOTHING
                                        </h3>
                                        <p className="text-slate-300">
                                            Hold still. Capturing quiet CAN baseline before action.
                                        </p>
                                    </>
                                )}

                                {phase === "countdown" && (
                                    <>
                                        <p className="mb-2 text-xs tracking-[0.35em] text-yellow-300">
                                            GET READY
                                        </p>
                                        <div className="mb-4 text-8xl font-black text-yellow-100">
                                            {countdownNumber}
                                        </div>
                                        <h3 className="text-3xl font-black text-green-100">
                                            {step?.label}
                                        </h3>
                                    </>
                                )}

                                {phase === "action_now" && (
                                    <>
                                        <p className="mb-2 text-xs tracking-[0.35em] text-red-300">
                                            ACTION WINDOW OPEN
                                        </p>

                                        <div className="rounded-3xl border border-red-300/60 bg-red-500/20 px-8 py-16 shadow-2xl shadow-red-500/20">
                                            <h3 className="text-5xl font-black text-red-100">
                                                {step?.actionText}
                                            </h3>
                                        </div>

                                        <p className="mt-5 text-sm text-slate-400">
                                            Marker was recorded automatically at ACTION NOW.
                                        </p>
                                    </>
                                )}

                                {phase === "capturing" && (
                                    <>
                                        <p className="mb-2 text-xs tracking-[0.35em] text-green-300">
                                            POST-ACTION CAPTURE
                                        </p>
                                        <h3 className="mb-4 text-4xl font-black text-green-100">
                                            HOLD STILL
                                        </h3>
                                        <p className="text-slate-300">
                                            Capturing CAN response after the action.
                                        </p>
                                    </>
                                )}

                                <div className="mt-8 h-3 overflow-hidden rounded-full bg-slate-800">
                                    <div
                                        className={`h-full rounded-full transition-all ${phase === "action_now" ? "bg-red-400" : "bg-yellow-300"
                                            }`}
                                        style={{ width: `${phaseProgress * 100}%` }}
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="mt-6 flex justify-between border-t border-green-400/20 pt-4">
                            <button
                                onClick={stopSession}
                                className="rounded-xl border border-red-300/40 bg-red-500/10 px-5 py-3 font-bold text-red-100 hover:bg-red-400/20"
                            >
                                ABORT
                            </button>

                            <div className="text-xs text-slate-500">
                                current step: {step?.id}
                            </div>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}