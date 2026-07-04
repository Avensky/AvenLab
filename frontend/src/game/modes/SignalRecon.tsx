import { useEffect, useMemo, useState } from "react";
import { useUIStore } from "../../store";
import { SignalReconMission } from "./SignalReconMission";
import { GameButton } from "../../components/GameButton";
import { useCanBusStore } from "../../store/canBusStore";
import { useSignalReconStore, type ReconMission } from "../../store/signalReconStore";
import { MISSION_RANKS, type MissionRank } from "../../store/signalReconMissions";

const RANK_FILTERS: Array<MissionRank | "ALL"> = ["ALL", "BASELINE", "A", "S", "B", "C"];

function formatStatus(status: ReconMission["status"]) {
  return status.toUpperCase();
}

function formatStage(stage: ReconMission["recording_stage"]) {
  return stage.replace(/_/g, " ").toUpperCase();
}

function rankLabel(rank: MissionRank | "ALL") {
  if (rank === "ALL") return "ALL";
  if (rank === "BASELINE") return "BASE";
  return `RANK ${rank}`;
}

function rankClass(rank: MissionRank) {
  if (rank === "S") return "border-red-300/50 bg-red-500/10 text-red-100";
  if (rank === "A") return "border-yellow-300/50 bg-yellow-500/10 text-yellow-100";
  if (rank === "B") return "border-cyan-300/50 bg-cyan-500/10 text-cyan-100";
  if (rank === "C") return "border-slate-300/40 bg-slate-500/10 text-slate-100";
  return "border-green-300/50 bg-green-500/10 text-green-100";
}

function missionButtonTitle(mission: ReconMission) {
  return mission.rank === "BASELINE" ? mission.mission_code.replace("BASE_", "") : mission.mission_code;
}

export function SignalRecon() {
  const setScreen = useUIStore((s) => s.setScreen);

  const missions = useSignalReconStore((s) => s.missions);
  const selectedMission = useSignalReconStore((s) => s.selectedMission);
  const selectedRank = useSignalReconStore((s) => s.selectedRank);
  const steps = useSignalReconStore((s) => s.steps);
  const activeSessionId = useSignalReconStore((s) => s.activeSessionId);
  const activeRunId = useSignalReconStore((s) => s.activeRunId);
  const activePhase = useSignalReconStore((s) => s.activePhase);
  const loadMissions = useSignalReconStore((s) => s.loadMissions);
  const selectMission = useSignalReconStore((s) => s.selectMission);
  const setSelectedRank = useSignalReconStore((s) => s.setSelectedRank);
  const startSession = useSignalReconStore((s) => s.startSession);
  const stopSession = useSignalReconStore((s) => s.stopSession);

  const selectedInterface = useCanBusStore((s) => s.selectedInterface);
  const selectedMode = useCanBusStore((s) => s.selectedMode);

  const [missionTerminalOpen, setMissionTerminalOpen] = useState(false);
  const [queueMinimized, setQueueMinimized] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void loadMissions();
  }, [loadMissions]);

  const visibleMissions = useMemo(() => {
    if (selectedRank === "ALL") return missions;
    return missions.filter((mission) => mission.rank === selectedRank);
  }, [missions, selectedRank]);

  const mission = selectedMission ?? visibleMissions[0] ?? missions[0] ?? null;
  const sessionActive = Boolean(activeSessionId);
  const runActive = Boolean(activeRunId);

  useEffect(() => {
    if (sessionActive) return;
    if (!visibleMissions.length) return;

    const selectedIsVisible = selectedMission
      ? visibleMissions.some((item) => item.mission_code === selectedMission.mission_code)
      : false;

    if (!selectedIsVisible) {
      void selectMission(visibleMissions[0]);
    }
  }, [sessionActive, selectedMission, selectMission, visibleMissions]);

  const handleSelectMission = async (nextMission: ReconMission) => {
    if (runActive) return;

    if (sessionActive && selectedMission?.mission_code !== nextMission.mission_code) {
      setError("Stop the active CAN session before switching missions.");
      return;
    }

    setError(null);
    await selectMission(nextMission);
    setMissionTerminalOpen(false);
    setQueueMinimized(false);
  };

  const openMissionTerminal = async () => {
    if (!mission || busy) return;

    setBusy(true);
    setError(null);

    try {
      if (selectedMission?.mission_code !== mission.mission_code) {
        await selectMission(mission);
      }

      if (!activeSessionId) {
        await startSession({ busInterface: selectedInterface, busMode: selectedMode });
      }

      setMissionTerminalOpen(true);
      setQueueMinimized(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start Signal Recon session.");
    } finally {
      setBusy(false);
    }
  };

  const handleExit = async () => {
    if (activeSessionId) {
      try {
        await stopSession({ ui_event: "exit_signal_recon" });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to stop active CAN session.");
        return;
      }
    }

    setScreen("main");
  };

  const handleMissionClosed = () => {
    setMissionTerminalOpen(false);
    setQueueMinimized(false);
  };

  return (
    <div className="relative game-ui h-screen w-screen overflow-hidden bg-[#020617] text-green-100">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(34,197,94,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(34,197,94,0.05)_1px,transparent_1px)] bg-[size:32px_32px]" />

      <div className="relative z-10 flex h-full flex-col p-6">
        <header className="mb-5 flex items-center justify-between border-b border-green-400/20 pb-4">
          <div>
            <p className="text-xs tracking-[0.45em] text-yellow-300">
              NIWC // CAN SIGNAL ACQUISITION
            </p>
            <h1 className="text-4xl font-black text-green-100">
              SIGNAL RECON MODE
            </h1>
          </div>

          <div className="flex items-center gap-4">
            <div className="hidden text-right font-mono text-xs text-slate-400 md:block">
              <p>IFACE: {selectedInterface}</p>
              <p>MODE: {selectedMode}</p>
            </div>
            <GameButton
              onPress={handleExit}
              disabled={busy || runActive}
              className="rounded-lg border border-red-400/40 bg-red-500/10 px-4 py-2 text-sm font-bold text-red-100 hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-40"
            >
              EXIT
            </GameButton>
          </div>
        </header>

        <main
          className={`grid flex-1 gap-4 transition-all ${queueMinimized
            ? "grid-cols-[96px_1fr]"
            : "grid-cols-1 lg:grid-cols-[0.85fr_1.15fr]"
            }`}
        >
          <section
            className={`min-h-0 rounded-2xl border border-green-400/20 bg-slate-950/90 shadow-xl shadow-green-500/10 transition-all ${queueMinimized ? "p-3" : "p-5"
              }`}
          >
            {queueMinimized ? (
              <div className="flex h-full flex-col gap-3">
                <GameButton
                  onPress={() => setQueueMinimized(false)}
                  className="flex h-10 w-full items-center justify-center rounded-lg border border-slate-600 bg-slate-900 font-mono text-xs text-slate-300 hover:bg-slate-800"
                >
                  MAX
                </GameButton>

                <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pr-1">
                  {visibleMissions.map((item) => {
                    const selected = mission?.mission_code === item.mission_code;
                    const disabled = runActive || (sessionActive && !selected);

                    return (
                      <GameButton
                        key={item.mission_code}
                        disabled={disabled}
                        onPress={() => void handleSelectMission(item)}
                        className={`flex h-16 w-full items-center justify-center rounded-xl border font-mono text-xs font-black transition disabled:cursor-not-allowed disabled:opacity-30 ${selected
                          ? "border-green-300 bg-green-500/20 text-green-100"
                          : "border-slate-700 bg-slate-900/80 text-slate-400 hover:bg-slate-800"
                          }`}
                      >
                        {missionButtonTitle(item)}
                      </GameButton>
                    );
                  })}
                </div>
              </div>
            ) : (
              <>
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-xl font-bold text-green-200">Mission Queue</h2>
                    <p className="font-mono text-xs text-slate-500">
                      {visibleMissions.length} visible / {missions.length} total
                    </p>
                  </div>

                  <GameButton
                    onPress={() => setQueueMinimized(true)}
                    className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-1 font-mono text-xs text-slate-300 hover:bg-slate-800"
                  >
                    MIN
                  </GameButton>
                </div>

                <div className="mb-4 grid grid-cols-3 gap-2 xl:grid-cols-6">
                  {RANK_FILTERS.map((rank) => (
                    <GameButton
                      key={rank}
                      disabled={runActive || sessionActive}
                      onPress={() => setSelectedRank(rank)}
                      className={`rounded-lg border px-3 py-2 font-mono text-xs font-bold transition disabled:cursor-not-allowed disabled:opacity-40 ${selectedRank === rank
                        ? "border-green-300 bg-green-500/20 text-green-100"
                        : "border-slate-700 bg-slate-900 text-slate-400 hover:bg-slate-800"
                        }`}
                    >
                      {rankLabel(rank)}
                    </GameButton>
                  ))}
                </div>

                <div className="max-h-[calc(100vh-250px)] space-y-3 overflow-y-auto pr-1">
                  {visibleMissions.map((item) => {
                    const selected = mission?.mission_code === item.mission_code;
                    const disabled = runActive || (sessionActive && !selected);

                    return (
                      <GameButton
                        key={item.mission_code}
                        disabled={disabled}
                        onPress={() => void handleSelectMission(item)}
                        className={`w-full rounded-xl border p-4 text-left transition disabled:cursor-not-allowed disabled:opacity-40 ${selected
                          ? "border-green-300 bg-green-500/15"
                          : "border-slate-700 bg-slate-900/80 hover:bg-slate-800"
                          }`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <span className="font-mono text-xs text-yellow-300">
                            {item.mission_code}
                          </span>
                          <span className={`rounded-full border px-2 py-1 text-[10px] font-bold ${rankClass(item.rank)}`}>
                            {item.rank === "BASELINE" ? "BASELINE" : `RANK ${item.rank}`}
                          </span>
                        </div>

                        <h3 className="mt-2 font-bold text-green-100">{item.title}</h3>

                        <div className="mt-2 grid gap-1 font-mono text-xs text-slate-500">
                          <p>target: {item.target}</p>
                          <p>stage: {formatStage(item.recording_stage)}</p>
                          <p>status: {formatStatus(item.status)}</p>
                        </div>
                      </GameButton>
                    );
                  })}
                </div>
              </>
            )}
          </section>

          <section className="min-h-0 rounded-2xl border border-green-400/20 bg-black/80 font-mono shadow-xl shadow-green-500/10">
            {missionTerminalOpen ? (
              <SignalReconMission onExit={handleMissionClosed} />
            ) : (
              <div className="p-6">
                <div className="mb-4 flex items-center justify-between border-b border-green-400/20 pb-3">
                  <div>
                    <h2 className="text-lg font-bold text-green-200">Tactical Terminal</h2>
                    <p className="text-xs text-slate-500">
                      Store-driven mission catalog + backend CAN session markers
                    </p>
                  </div>
                  <span className="text-xs text-yellow-300">
                    SESSION: {activeSessionId ? activePhase.toUpperCase() : "IDLE"}
                  </span>
                </div>

                {error && (
                  <div className="mb-4 rounded-xl border border-red-300/40 bg-red-500/10 p-3 text-sm text-red-100">
                    {error}
                  </div>
                )}

                {mission ? (
                  <>
                    <div className="space-y-2 text-sm">
                      <p className="text-green-400">
                        &gt; selected mission: {mission.title}
                      </p>
                      <p className="text-slate-400">
                        &gt; mission code: {mission.mission_code}
                      </p>
                      <p className="text-slate-400">
                        &gt; target signal: {mission.target}
                      </p>
                      <p className="text-slate-400">
                        &gt; difficulty: {mission.difficulty.label} / score {mission.difficulty.difficulty_score}
                      </p>
                      <p className="text-slate-400">
                        &gt; protocol: baseline → countdown → action → capture → marker sync
                      </p>
                    </div>

                    <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_0.85fr]">
                      <div className="rounded-xl border border-green-400/20 bg-slate-950 p-4">
                        <h3 className="mb-2 font-bold text-yellow-300">Mission Steps</h3>

                        {steps.length > 0 ? (
                          <ol className="list-decimal space-y-2 pl-5 text-sm text-slate-300">
                            {steps.slice(0, 8).map((step) => (
                              <li key={step.id}>
                                <span className="text-green-100">{step.label}</span>
                                {step.action_text && (
                                  <span className="text-slate-500"> — {step.action_text}</span>
                                )}
                              </li>
                            ))}
                            {steps.length > 8 && (
                              <li className="text-slate-500">+ {steps.length - 8} more steps</li>
                            )}
                          </ol>
                        ) : (
                          <p className="text-sm text-slate-500">No steps generated for this mission yet.</p>
                        )}
                      </div>

                      <div className="rounded-xl border border-green-400/20 bg-slate-950 p-4">
                        <h3 className="mb-2 font-bold text-yellow-300">Rank Metadata</h3>
                        <div className="space-y-2 text-sm text-slate-300">
                          <p>rank: {mission.rank}</p>
                          <p>category: {mission.category}</p>
                          <p>research value: {mission.difficulty.research_value}</p>
                          <p>demo value: {mission.difficulty.demo_value}</p>
                          <p className="text-slate-500">{MISSION_RANKS[mission.rank].reason}</p>
                        </div>
                      </div>
                    </div>

                    <div className="mt-6 grid grid-cols-1 gap-3 md:grid-cols-2">
                      <GameButton
                        onPress={openMissionTerminal}
                        disabled={busy || !steps.length || runActive}
                        className="rounded-xl border border-green-300/40 bg-green-500/10 px-5 py-4 font-bold text-green-100 hover:bg-green-400/20 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {activeSessionId ? "OPEN MISSION TERMINAL" : "START CAN SESSION"}
                      </GameButton>

                      <GameButton
                        onPress={() => setQueueMinimized(true)}
                        className="rounded-xl border border-cyan-300/40 bg-cyan-500/10 px-5 py-4 font-bold text-cyan-100 hover:bg-cyan-400/20"
                      >
                        COMPACT QUEUE
                      </GameButton>
                    </div>
                  </>
                ) : (
                  <div className="rounded-xl border border-yellow-300/40 bg-yellow-500/10 p-4 text-yellow-100">
                    No Signal Recon missions are loaded.
                  </div>
                )}
              </div>
            )}
          </section>
        </main>
      </div>
    </div>
  );
}
