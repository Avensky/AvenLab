import { useEffect, useMemo, useState } from "react";
import { useSignalReconStore } from "../../store/signalReconStore";

export function SignalReconMission() {
    const active = useSignalReconStore((s) => s.active);
    const tasks = useSignalReconStore((s) => s.tasks);
    const taskIndex = useSignalReconStore((s) => s.taskIndex);
    const taskStartedAt = useSignalReconStore((s) => s.taskStartedAt);
    const markers = useSignalReconStore((s) => s.markers);

    const start = useSignalReconStore((s) => s.start);
    const stop = useSignalReconStore((s) => s.stop);
    const nextTask = useSignalReconStore((s) => s.nextTask);
    const addMarker = useSignalReconStore((s) => s.addMarker);

    const [now, setNow] = useState(performance.now());

    const task = tasks[taskIndex];

    const elapsedMs = useMemo(() => {
        if (!taskStartedAt) return 0;
        return now - taskStartedAt;
    }, [now, taskStartedAt]);

    const progress = task ? Math.min(elapsedMs / task.durationMs, 1) : 0;

    useEffect(() => {
        if (!active) return;

        const id = window.setInterval(() => {
            setNow(performance.now());
        }, 100);

        return () => window.clearInterval(id);
    }, [active]);

    useEffect(() => {
        if (!active || !task) return;
        if (progress < 1) return;

        addMarker({
            taskId: task.id,
            event: "task_complete",
        });

        nextTask();
    }, [active, progress, task, addMarker, nextTask]);

    return (
        <div className="h-screen w-screen overflow-hidden bg-[#020617] text-green-100">
            <div className="absolute inset-0 bg-[linear-gradient(rgba(34,197,94,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(34,197,94,0.05)_1px,transparent_1px)] bg-[size:32px_32px]" />

            <div className="relative z-10 flex h-full items-center justify-center p-6">
                <div className="w-full max-w-xl rounded-2xl border border-green-400/20 bg-slate-950/90 p-6 font-mono shadow-xl shadow-green-500/10">
                    <p className="mb-2 text-xs tracking-[0.35em] text-yellow-300">
                        CAN SIGNAL ACQUISITION
                    </p>

                    <h1 className="mb-4 text-3xl font-black text-green-100">
                        SIGNAL RECON
                    </h1>

                    {!active ? (
                        <>
                            <p className="mb-6 text-sm text-slate-300">
                                Run guided vehicle actions and record timestamped markers for CAN
                                decoding.
                            </p>

                            <button
                                onClick={start}
                                className="w-full rounded-xl border border-green-300/40 bg-green-500/10 px-5 py-4 font-bold text-green-100 hover:bg-green-400/20"
                            >
                                START RECON SESSION
                            </button>
                        </>
                    ) : (
                        <>
                            <div className="mb-3 flex items-center justify-between border-b border-green-400/20 pb-3">
                                <span className="text-xs text-yellow-300">
                                    TASK {taskIndex + 1} / {tasks.length}
                                </span>

                                <span className="text-xs text-slate-400">
                                    MARKERS: {markers.length}
                                </span>
                            </div>

                            <h2 className="mb-2 text-2xl font-bold text-green-200">
                                {task.label}
                            </h2>

                            <p className="mb-5 text-sm text-slate-300">
                                {task.instruction}
                            </p>

                            <div className="mb-6 h-3 overflow-hidden rounded-full bg-slate-800">
                                <div
                                    className="h-full rounded-full bg-green-400 transition-all"
                                    style={{ width: `${progress * 100}%` }}
                                />
                            </div>

                            <div className="grid grid-cols-3 gap-3">
                                <button
                                    onClick={() =>
                                        addMarker({
                                            taskId: task.id,
                                            event: "user_action",
                                        })
                                    }
                                    className="rounded-xl border border-cyan-300/40 bg-cyan-500/10 px-4 py-3 font-bold text-cyan-100 hover:bg-cyan-400/20"
                                >
                                    MARK
                                </button>

                                <button
                                    onClick={nextTask}
                                    className="rounded-xl border border-yellow-300/40 bg-yellow-500/10 px-4 py-3 font-bold text-yellow-100 hover:bg-yellow-400/20"
                                >
                                    SKIP
                                </button>

                                <button
                                    onClick={stop}
                                    className="rounded-xl border border-red-300/40 bg-red-500/10 px-4 py-3 font-bold text-red-100 hover:bg-red-400/20"
                                >
                                    STOP
                                </button>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}