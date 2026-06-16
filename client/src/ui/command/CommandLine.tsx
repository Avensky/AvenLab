// ui/command/CommandLine.tsx
import { useInputStore } from "../../store";
import { PlayerFlags, hasFlag } from "../../store/tools/inputMasks";
import { useCanDataStore } from "../../store/canDataStore";

export function CommandLine() {
    const playerMask = useInputStore((s) => s.input.playerMask);
    const togglePlayerFlag = useInputStore((s) => s.togglePlayerFlag);

    const open = useCanDataStore((s) => s.commandOpen);
    const activeView = useCanDataStore((s) => s.activeView);
    const setActiveView = useCanDataStore((s) => s.setActiveView);
    const logs = useCanDataStore((s) => s.logs);
    const clearFrames = useCanDataStore((s) => s.clearFrames);
    const currentSessionId = useCanDataStore((s) => s.currentSessionId);

    const candump = hasFlag(playerMask, PlayerFlags.CANDUMP);
    const dyno = hasFlag(playerMask, PlayerFlags.DYNO);

    const startStopRecording = () => {
        if (!candump) {
            clearFrames();
            setActiveView("cli");
        }

        togglePlayerFlag(PlayerFlags.CANDUMP);
    };

    const addMarker = async () => {
        if (!currentSessionId) return;

        await fetch(`/api/v1/sessions/${currentSessionId}/marks`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ type: "action" }),
        });
    };

    if (!open) return null;

    return (
        <div className="fixed left-4 top-20 z-50 flex h-[72vh] w-[min(920px,calc(100vw-32px))] flex-col overflow-hidden rounded-2xl border border-green-400/20 bg-slate-950/95 text-green-100 shadow-2xl shadow-green-500/10 backdrop-blur">
            <div className="flex items-center justify-between border-b border-green-400/20 px-4 py-3">
                <div>
                    <p className="font-mono text-xs tracking-[0.35em] text-yellow-300">
                        AVENLAB // SIGNAL COMMAND
                    </p>
                    <h2 className="text-xl font-black">COMMAND LINE</h2>
                </div>

                <div className="flex gap-2">
                    <button
                        onClick={startStopRecording}
                        className={`rounded-lg border px-3 py-2 text-xs font-bold ${candump
                                ? "border-red-300/50 bg-red-500/20 text-red-100"
                                : "border-green-300/40 bg-green-500/10 text-green-100"
                            }`}
                    >
                        {candump ? "STOP REC" : "RECORD"}
                    </button>

                    <button
                        disabled={!candump || !currentSessionId}
                        onClick={addMarker}
                        className="rounded-lg border border-yellow-300/40 bg-yellow-500/10 px-3 py-2 text-xs font-bold text-yellow-100 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                        MARK
                    </button>

                    <button
                        onClick={() => togglePlayerFlag(PlayerFlags.DYNO)}
                        className={`rounded-lg border px-3 py-2 text-xs font-bold ${dyno
                                ? "border-cyan-300/50 bg-cyan-500/20 text-cyan-100"
                                : "border-slate-600 bg-slate-900 text-slate-300"
                            }`}
                    >
                        DYNO
                    </button>
                </div>
            </div>

            <div className="flex gap-2 border-b border-green-400/20 px-4 py-2">
                {(["cli", "summary", "frames", "raw", "playback", "diff", "heatmap"] as const).map(
                    (view) => (
                        <button
                            key={view}
                            onClick={() => setActiveView(view)}
                            className={`rounded-lg px-3 py-2 text-xs font-bold uppercase ${activeView === view
                                    ? "bg-green-500/20 text-green-100"
                                    : "bg-slate-900 text-slate-400 hover:bg-slate-800"
                                }`}
                        >
                            {view}
                        </button>
                    )
                )}
            </div>

            <div className="min-h-0 flex-1 overflow-auto p-4 font-mono text-sm">
                {activeView === "cli" && (
                    <div className="space-y-1">
                        {logs.length === 0 ? (
                            <p className="text-slate-500">&gt; waiting for command events...</p>
                        ) : (
                            logs.map((line, i) => (
                                <p key={i} className="text-green-300">
                                    &gt; {line}
                                </p>
                            ))
                        )}
                    </div>
                )}

                {activeView === "summary" && <div>Summary view next</div>}
                {activeView === "frames" && <div>Frame table next</div>}
                {activeView === "raw" && <div>Raw frame table next</div>}
                {activeView === "playback" && <div>Playback view next</div>}
                {activeView === "diff" && <div>Snapshot diff next</div>}
                {activeView === "heatmap" && <div>Byte heat map next</div>}
            </div>
        </div>
    );
}