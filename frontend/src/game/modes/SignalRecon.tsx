import { useCallback, useEffect, useMemo, useState } from "react";
import { useSelectionStore, useUIStore } from "../../store";
import { SignalReconMission } from "./SignalReconMission";
import { GameButton } from "../../components/GameButton";
import {
  getApiBaseUrl,
  useCanBusStore,
  type CanInterface,
  type CanMode,
} from "../../store/canBusStore";
import {
  useSignalReconStore,
  type ReconMission,
} from "../../store/signalReconStore";
import {
  MISSION_RANKS,
  type MissionRank,
} from "../../store/signalReconMissions";

const RANK_FILTERS: Array<MissionRank | "ALL"> = [
  "ALL",
  "BASELINE",
  "A",
  "S",
  "B",
  "C",
];
const CAN_INTERFACE_OPTIONS: CanInterface[] = ["can0", "can1", "can2", "vcan0"];
const CAN_MODE_OPTIONS: CanMode[] = ["listen-only", "simulation", "live"];

type CaptureKind = "live" | "simulation";

type MissionRunSummary = {
  mission_code: string;
  session_id: string;
  vehicle_slug: string;
  bus_interface: string;
  bus_mode: string;
  capture_kind: CaptureKind | string;
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
};

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
  if (rank === "A")
    return "border-yellow-300/50 bg-yellow-500/10 text-yellow-100";
  if (rank === "B") return "border-cyan-300/50 bg-cyan-500/10 text-cyan-100";
  if (rank === "C") return "border-slate-300/40 bg-slate-500/10 text-slate-100";
  return "border-green-300/50 bg-green-500/10 text-green-100";
}

function missionButtonTitle(mission: ReconMission) {
  return mission.rank === "BASELINE"
    ? mission.mission_code.replace("BASE_", "")
    : mission.mission_code;
}


function captureKindFor(mode: CanMode, iface: CanInterface): CaptureKind {
  if (mode === "simulation" || iface === "vcan0") return "simulation";
  return "live";
}

function busModeLabel(mode: CanMode) {
  if (mode === "listen-only") return "LIVE / LISTEN-ONLY";
  if (mode === "live") return "LIVE / ACTIVE";
  return "SIMULATION";
}

// function shortSessionId(sessionId: string | null | undefined) {
//   if (!sessionId) return "—";
//   return `${sessionId.slice(0, 8)}…${sessionId.slice(-4)}`;
// }

function formatConfidence(value: number | null | undefined) {
  if (typeof value !== "number" || Number.isNaN(value)) return "—";
  return `${Math.round(value * 100)}%`;
}

function missionProgressLabel(summary: MissionRunSummary | undefined, mission: ReconMission) {
  if (!summary) return "OPEN";
  if (summary.frame_count <= 0) return "NO FRAMES";
  if (summary.analysis_mode === "baseline_profile" || mission.rank === "BASELINE") {
    return summary.analyzed ? "PROFILED" : "RECORDED";
  }
  if (typeof summary.confidence === "number") return `DONE ${formatConfidence(summary.confidence)}`;
  return summary.analyzed ? "ANALYZED" : "RECORDED";
}

function missionProgressClass(summary: MissionRunSummary | undefined, mission: ReconMission) {
  if (!summary) return "border-slate-700 bg-slate-900 text-slate-400";
  if (summary.frame_count <= 0) return "border-red-300/50 bg-red-500/10 text-red-100";
  if (summary.analysis_mode === "baseline_profile" || mission.rank === "BASELINE") {
    return "border-cyan-300/50 bg-cyan-500/10 text-cyan-100";
  }
  if ((summary.confidence ?? 0) >= 0.75) return "border-green-300/50 bg-green-500/10 text-green-100";
  if ((summary.confidence ?? 0) >= 0.45) return "border-yellow-300/50 bg-yellow-500/10 text-yellow-100";
  return "border-slate-500 bg-slate-800 text-slate-300";
}

export function SignalRecon() {
  const setScreen = useUIStore((s) => s.setScreen);
  const selectedVehicle = useSelectionStore((s) => s.getSelectedVehicle());

  const missions = useSignalReconStore((s) => s.missions);
  const selectedMission = useSignalReconStore((s) => s.selectedMission);
  const selectedRank = useSignalReconStore((s) => s.selectedRank);
  const steps = useSignalReconStore((s) => s.steps);
  const activeSessionId = useSignalReconStore((s) => s.activeSessionId);
  const activeRunId = useSignalReconStore((s) => s.activeRunId);
  const activePhase = useSignalReconStore((s) => s.activePhase);
  const vehicleSlug = useSignalReconStore((s) => s.vehicleSlug);
  const setVehicleSlug = useSignalReconStore((s) => s.setVehicleSlug);
  const loadMissions = useSignalReconStore((s) => s.loadMissions);
  const selectMission = useSignalReconStore((s) => s.selectMission);
  const switchMission = useSignalReconStore((s) => s.switchMission);
  const setSelectedRank = useSignalReconStore((s) => s.setSelectedRank);
  const stopSession = useSignalReconStore((s) => s.stopSession);

  const canStatus = useCanBusStore((s) => s.status);
  const selectedInterface = useCanBusStore((s) => s.selectedInterface);
  const selectedMode = useCanBusStore((s) => s.selectedMode);
  const setSelectedInterface = useCanBusStore((s) => s.setSelectedInterface);
  const setSelectedMode = useCanBusStore((s) => s.setSelectedMode);
  const refreshCanStatus = useCanBusStore((s) => s.refreshStatus);

  const [missionTerminalOpen, setMissionTerminalOpen] = useState(false);
  const [queueMinimized, setQueueMinimized] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [missionProgressByCode, setMissionProgressByCode] = useState<Record<string, MissionRunSummary>>({});
  const [missionSessions, setMissionSessions] = useState<MissionRunSummary[]>([]);
  const [missionProgressLoading, setMissionProgressLoading] = useState(false);
  const [missionProgressError, setMissionProgressError] = useState<string | null>(null);



  useEffect(() => {
    void loadMissions();
  }, [loadMissions]);

  useEffect(() => {
    void refreshCanStatus();
  }, [refreshCanStatus]);

  const visibleMissions = useMemo(() => {
    if (selectedRank === "ALL") return missions;
    return missions.filter((mission) => mission.rank === selectedRank);
  }, [missions, selectedRank]);

  const mission = selectedMission ?? visibleMissions[0] ?? missions[0] ?? null;
  const selectedMissionProgress = mission ? missionProgressByCode[mission.mission_code] : undefined;
  const selectedMissionSessions = useMemo(
    () => mission
      ? missionSessions.filter((session) => session.mission_code === mission.mission_code)
      : [],
    [mission, missionSessions],
  );
  const sessionActive = Boolean(activeSessionId);
  const runActive = Boolean(activeRunId);
  const canControlsDisabled = busy || sessionActive || runActive;

  const selectedCaptureKind = useMemo(
    () => captureKindFor(selectedMode, selectedInterface),
    [selectedInterface, selectedMode],
  );

  const refreshMissionProgressFromDb = useCallback(async () => {
    if (!vehicleSlug) return;

    setMissionProgressLoading(true);
    setMissionProgressError(null);

    try {
      const progressParams = new URLSearchParams({
        vehicle_slug: vehicleSlug,
        bus_interface: selectedInterface,
        capture_kind: selectedCaptureKind,
      });
      const historyParams = new URLSearchParams({
        vehicle_slug: vehicleSlug,
        capture_kind: selectedCaptureKind,
        limit: "500",
      });

      const [progressResponse, historyResponse] = await Promise.all([
        fetch(`${getApiBaseUrl()}/data/can/mission-progress?${progressParams.toString()}`),
        fetch(`${getApiBaseUrl()}/data/can/mission-progress?${historyParams.toString()}`),
      ]);
      const progressData = (await progressResponse.json().catch(() => ({}))) as {
        ok?: boolean;
        missions?: Record<string, MissionRunSummary>;
        detail?: string;
        error?: string;
      };
      const historyData = (await historyResponse.json().catch(() => ({}))) as {
        ok?: boolean;
        sessions?: MissionRunSummary[];
        detail?: string;
        error?: string;
      };

      if (!progressResponse.ok || progressData.ok === false) {
        throw new Error(progressData.detail ?? progressData.error ?? `Mission progress read failed with HTTP ${progressResponse.status}.`);
      }
      if (!historyResponse.ok || historyData.ok === false) {
        throw new Error(historyData.detail ?? historyData.error ?? `Session history read failed with HTTP ${historyResponse.status}.`);
      }

      setMissionProgressByCode(progressData.missions ?? {});
      setMissionSessions(historyData.sessions ?? []);
    } catch (err) {
      setMissionProgressError(err instanceof Error ? err.message : "Failed to read mission progress.");
    } finally {
      setMissionProgressLoading(false);
    }
  }, [selectedCaptureKind, selectedInterface, vehicleSlug]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void refreshMissionProgressFromDb();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [activeSessionId, refreshMissionProgressFromDb]);


  useEffect(() => {
    if (sessionActive || runActive) return;
    setVehicleSlug(selectedVehicle.canIdentity.slug);
  }, [
    runActive,
    selectedVehicle.canIdentity.slug,
    sessionActive,
    setVehicleSlug,
  ]);

  const availableInterfaces = useMemo(() => {
    if (!canStatus) return CAN_INTERFACE_OPTIONS;

    const available = CAN_INTERFACE_OPTIONS.filter((iface) => {
      const interfaceStatus = canStatus[iface];
      return interfaceStatus?.exists || iface === selectedInterface;
    });

    return available.length ? available : CAN_INTERFACE_OPTIONS;
  }, [canStatus, selectedInterface]);

  useEffect(() => {
    if (sessionActive) return;
    if (!visibleMissions.length) return;

    const selectedIsVisible = selectedMission
      ? visibleMissions.some(
        (item) => item.mission_code === selectedMission.mission_code,
      )
      : false;

    if (!selectedIsVisible) {
      void selectMission(visibleMissions[0]);
    }
  }, [sessionActive, selectedMission, selectMission, visibleMissions]);

  const handleSelectMission = async (nextMission: ReconMission) => {
    if (busy || runActive) return;

    const isSameMission =
      selectedMission?.mission_code === nextMission.mission_code;
    if (isSameMission) {
      setQueueMinimized(true);
      return;
    }

    setBusy(true);
    setError(null);

    try {
      if (sessionActive) {
        // Preserve data integrity: one database session belongs to one mission.
        // A hot switch closes the old session and immediately starts a new
        // session using the same interface and safety mode.
        await switchMission({
          mission: nextMission,
          busInterface: selectedInterface,
          busMode: selectedMode,
          restartActiveSession: true,
        });
        setMissionTerminalOpen(true);
      } else {
        await selectMission(nextMission);
        // When browsing the queue, select the protocol without recording.
        // If the tactical terminal is already open, it updates in place.
        if (!missionTerminalOpen) {
          setMissionTerminalOpen(false);
        }
      }

      setQueueMinimized(true);
      await refreshMissionProgressFromDb();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to switch Signal Recon missions.",
      );
    } finally {
      setBusy(false);
    }
  };

  const openMissionTerminal = async () => {
    if (!mission || busy) return;

    setBusy(true);
    setError(null);

    try {
      if (selectedMission?.mission_code !== mission.mission_code) {
        await selectMission(mission);
      }

      // Review mode first: opening the tactical terminal must not create a new
      // CAN session. SignalReconMission will load the latest saved DB run for
      // this mission, and only RUN STEP / RUN FULL MISSION creates a new one.
      setMissionTerminalOpen(true);
      setQueueMinimized(true);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to open Signal Recon terminal.",
      );
    } finally {
      setBusy(false);
    }
  };

  const handleExit = async () => {
    if (activeSessionId) {
      try {
        await stopSession({ ui_event: "exit_signal_recon" });
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Failed to stop active CAN session.",
        );
        return;
      }
    }

    setScreen("signal_recon_setup");
  };

  const handleMaximizeQueue = () => {
    if (runActive) return;
    setMissionTerminalOpen(false);
    setQueueMinimized(false);
  };

  const handleMissionClosed = () => {
    handleMaximizeQueue();
  };

  return (
    <div className="relative game-ui h-[100dvh] w-screen overflow-hidden bg-[#020617] text-green-100">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(34,197,94,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(34,197,94,0.05)_1px,transparent_1px)] bg-[size:32px_32px]" />

      <div className="relative z-10 flex h-full min-h-0 flex-col overflow-hidden p-2 sm:p-3">
        <header className="mb-2 shrink-0 rounded-2xl border border-green-400/20 bg-black/40 p-2 sm:px-2 sm:py-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] tracking-[0.28em] text-yellow-300 sm:text-xs sm:tracking-[0.45em]">
                NIWC // CAN SIGNAL ACQUISITION
              </p>
              <h1 className="truncate text-2xl font-black text-green-100 sm:text-2xl">
                SIGNAL RECON
              </h1>
              <p className="truncate font-mono text-[10px] text-slate-500 sm:text-xs">
                {selectedVehicle.name} · {vehicleSlug}
                {activeSessionId
                  ? ` · session ${activeSessionId.slice(0, 8)}…${activeSessionId.slice(-4)}`
                  : ""}
                {` · ${activePhase.toUpperCase()}`}
                {` · ${busModeLabel(selectedMode)}`}
                {missionProgressLoading ? " · DB SYNC" : ` · ${Object.keys(missionProgressByCode).length} DB RUNS`}

              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 font-mono text-xs text-slate-400 sm:flex sm:items-end sm:justify-end">
              <label className="">
                <span className="text-[10px] tracking-[0.24em] text-slate-500">
                  IFACE
                </span>
                <select
                  value={selectedInterface}
                  disabled={canControlsDisabled}
                  onChange={(event) =>
                    setSelectedInterface(event.target.value as CanInterface)
                  }
                  className="w-full rounded-lg border border-green-400/30 bg-slate-950 px-3 py-2 sm:px-2 sm:py-1 font-mono text-xs font-bold text-green-100 outline-none transition hover:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-40 sm:w-36"
                >
                  {availableInterfaces.map((iface) => {
                    const interfaceStatus = canStatus?.[iface];
                    const label =
                      interfaceStatus?.up === false ? `${iface} · DOWN` : iface;

                    return (
                      <option key={iface} value={iface}>
                        {label}
                      </option>
                    );
                  })}
                </select>
              </label>

              <label className="">
                <span className="text-[10px] tracking-[0.24em] text-slate-500">
                  MODE:
                </span>
                <select
                  value={selectedMode}
                  disabled={canControlsDisabled}
                  onChange={(event) =>
                    setSelectedMode(event.target.value as CanMode)
                  }
                  className="w-full rounded-lg border border-green-400/30 bg-slate-950 px-3 py-2 sm:px-2 sm:py-1 font-mono text-xs font-bold text-green-100 outline-none transition hover:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-40 sm:w-40"
                >
                  {CAN_MODE_OPTIONS.map((mode) => (
                    <option key={mode} value={mode}>
                      {mode.toUpperCase()}
                    </option>
                  ))}
                </select>
              </label>
              <GameButton
                onPress={handleExit}
                disabled={busy || runActive}
                className="shrink-0 rounded-lg border border-red-400/40 bg-red-500/10 px-3 py-2 sm:px-2 sm:py-1 text-xs font-bold text-red-100 hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-40 ƒsm:text-sm"
              >
                EXIT
              </GameButton>
            </div>
          </div>


        </header>

        <main
          className={`grid min-h-0 flex-1 items-stretch gap-1 overflow-hidden ${queueMinimized
            ? "grid-cols-[56px_minmax(0,1fr)] sm:grid-cols-[72px_minmax(0,1fr)] lg:grid-cols-[96px_minmax(0,1fr)]"
            : "grid-cols-1"
            }`}
        >
          <section
            className={`flex flex-col h-full min-h-0 self-stretch overflow-hidden rounded-2xl border border-green-400/20 bg-slate-950/90 shadow-xl shadow-green-500/10 transition-all ${queueMinimized
              ? "w-[56px] p-1 sm:w-[72px] sm:px-2 sm:py-2 lg:w-[96px]"
              : "w-full p-3 sm:px-2 sm:py-2"
              }`}
          >
            {queueMinimized ? (
              <div className="flex h-full min-h-0 w-full flex-col gap-2">
                <GameButton
                  onPress={handleMaximizeQueue}
                  className="flex h-9 w-full items-center justify-center rounded-lg border border-slate-600 bg-slate-900 font-mono text-[10px] text-slate-300 hover:bg-slate-800 sm:text-xs"
                >
                  MAX
                </GameButton>

                <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto pr-1">
                  {visibleMissions.map((item) => {
                    const selected =
                      mission?.mission_code === item.mission_code;
                    const disabled = busy || runActive;
                    const progress = missionProgressByCode[item.mission_code];

                    return (
                      <GameButton
                        key={item.mission_code}
                        disabled={disabled}
                        onPress={() => void handleSelectMission(item)}
                        className={`flex min-h-10 w-full flex-col items-center justify-center rounded-xl border px-1 py-2 text-center font-mono text-[10px] font-black leading-tight transition disabled:cursor-not-allowed disabled:opacity-30 sm:text-xs ${selected
                          ? "border-green-300 bg-green-500/20 text-green-100"
                          : "border-slate-700 bg-slate-900/80 text-slate-400 hover:bg-slate-800"
                          }`}
                        title={`${item.mission_code} · ${missionProgressLabel(progress, item)}`}

                      >
                        <span>{missionButtonTitle(item)}</span>
                        {progress && (
                          <span className={`mt-1 h-1.5 w-1.5 rounded-full ${progress.frame_count > 0 ? "bg-green-300" : "bg-red-300"}`} />
                        )}
                      </GameButton>
                    );
                  })}
                </div>
              </div>
            ) : (
              <>
                <div className="mb-1 flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-xl font-bold text-green-200">
                      Mission Queue
                    </h2>
                    <p className="font-mono text-xs text-slate-500">
                      {visibleMissions.length} visible / {missions.length} total · {selectedInterface}/{busModeLabel(selectedMode)}
                      {missionProgressError ? ` · DB ERROR` : ""}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <GameButton
                      onPress={() => void refreshMissionProgressFromDb()}
                      disabled={missionProgressLoading}
                      className="rounded-lg border border-cyan-300/40 bg-cyan-500/10 px-3 py-1 font-mono text-xs font-bold text-cyan-100 hover:bg-cyan-400/20 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {missionProgressLoading ? "SYNC" : "READ DB"}
                    </GameButton>
                    <GameButton
                      onPress={() => {
                        if (mission) setQueueMinimized(true);
                      }}
                      className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-1 font-mono text-xs text-slate-300 hover:bg-slate-800"
                    >
                      TERMINAL
                    </GameButton>
                  </div>
                </div>

                <div className="mb-4 sm:mb-2 flex flex-wrap items-center gap-2">
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

                {error && (
                  <div className="mb-3 rounded-xl border border-red-300/40 bg-red-500/10 p-3 text-sm text-red-100">
                    {error}
                  </div>
                )}
                {missionProgressError && (
                  <div className="mb-3 rounded-xl border border-yellow-300/40 bg-yellow-500/10 p-3 text-sm text-yellow-100">
                    DB mission progress unavailable: {missionProgressError}
                  </div>
                )}
                <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1 pb-4">
                  {visibleMissions.map((item) => {
                    const selected =
                      mission?.mission_code === item.mission_code;
                    const disabled = busy || runActive;
                    const progress = missionProgressByCode[item.mission_code];

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
                          <div className="flex shrink-0 items-center gap-2">
                            <span
                              className={`rounded-full border px-2 py-1 text-[10px] font-bold ${missionProgressClass(progress, item)}`}
                            >
                              {missionProgressLabel(progress, item)}
                            </span>
                            <span
                              className={`rounded-full border px-2 py-1 text-[10px] font-bold ${rankClass(item.rank)}`}
                            >
                              {item.rank === "BASELINE"
                                ? "BASELINE"
                                : `RANK ${item.rank}`}
                            </span>
                          </div>
                        </div>

                        <h3 className="mt-2 font-bold text-green-100">
                          {item.title}
                        </h3>

                        <div className="mt-2 grid gap-1 font-mono text-xs text-slate-500">
                          <p>target: {item.target}</p>
                          <p>stage: {formatStage(item.recording_stage)}</p>
                          <p>status: {formatStatus(item.status)}</p>
                          {progress && (
                            <p>
                              db: {progress.source_label} · {progress.frame_count} frames · {progress.marker_count} markers
                              {progress.top_can_id_hex ? ` · ${progress.top_can_id_hex} ${formatConfidence(progress.confidence)}` : ""}
                            </p>
                          )}
                        </div>
                      </GameButton>
                    );
                  })}
                </div>
              </>
            )}
          </section>

          {queueMinimized && (
            <section className="h-full min-h-0 self-stretch overflow-hidden rounded-2xl border border-green-400/20 bg-black/80 font-mono shadow-xl shadow-green-500/10">
              {missionTerminalOpen ? (
                <SignalReconMission
                  onExit={handleMissionClosed}
                  initialSessionId={selectedMissionProgress?.session_id ?? null}
                  initialMissionProgress={selectedMissionProgress ?? null}
                  sessionHistory={selectedMissionSessions}
                  onDatabaseChanged={() => void refreshMissionProgressFromDb()}
                />
              ) : (
                <div className="h-full min-h-0 overflow-y-auto p-3 sm:px-2 sm:py-1">
                  <div className="mb-4 sm:mb-1 sm:pb-1 pb-6 flex items-center justify-between border-b border-green-400/20">
                    <div>
                      <h2 className="text-lg font-bold text-green-200">
                        Tactical Terminal
                      </h2>
                      <p className="text-xs text-slate-500">
                        Store-driven mission catalog + backend CAN session markers
                      </p>
                    </div>
                    <span className="text-xs text-yellow-300">
                      SESSION:{" "}
                      {activeSessionId ? activePhase.toUpperCase() : "IDLE"}
                    </span>
                  </div>

                  {error && (
                    <div className="mb-4 sm:mb-1 rounded-xl border border-red-300/40 bg-red-500/10 p-3 sm:p-1 text-sm text-red-100">
                      {error}
                    </div>
                  )}

                  {mission ? (
                    <>
                      <div className="text-sm">
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
                          &gt; difficulty: {mission.difficulty.label} / score{" "}
                          {mission.difficulty.difficulty_score}
                        </p>
                        <p className="text-slate-400">
                          &gt; protocol: baseline → countdown → action → capture →
                          marker sync
                        </p>
                        <p className="text-slate-400">
                          &gt; bus: {selectedInterface} / {busModeLabel(selectedMode)}
                        </p>
                        <p className="text-slate-400">
                          &gt; db result: {missionProgressLabel(missionProgressByCode[mission.mission_code], mission)}
                          {missionProgressByCode[mission.mission_code]?.top_can_id_hex
                            ? ` · ${missionProgressByCode[mission.mission_code]?.top_can_id_hex} ${formatConfidence(missionProgressByCode[mission.mission_code]?.confidence)}`
                            : ""}
                        </p>
                      </div>

                      <div className="mt-6 sm:mt-1 grid gap-1 lg:grid-cols-[1fr_0.85fr]">
                        <div className="rounded-xl border border-green-400/20 bg-slate-950 p-4 sm:p-2">
                          <h3 className="mb-2 sm:mb-1 font-bold text-yellow-300">
                            Mission Steps
                          </h3>

                          {steps.length > 0 ? (
                            <ol className="list-decimal pl-5 text-sm text-slate-300">
                              {steps.slice(0, 8).map((step) => (
                                <li key={step.id}>
                                  <span className="text-green-100">
                                    {step.label}
                                  </span>
                                  {step.action_text && (
                                    <span className="text-slate-500">
                                      {" "}
                                      — {step.action_text}
                                    </span>
                                  )}
                                </li>
                              ))}
                              {steps.length > 8 && (
                                <li className="text-slate-500">
                                  + {steps.length - 8} more steps
                                </li>
                              )}
                            </ol>
                          ) : (
                            <p className="text-sm text-slate-500">
                              No steps generated for this mission yet.
                            </p>
                          )}
                        </div>

                        <div className="rounded-xl border border-green-400/20 bg-slate-950 p-4 sm:p-2">
                          <h3 className="mb-2 sm:mb-1 font-bold text-yellow-300">
                            Rank Metadata
                          </h3>
                          <div className=" text-sm text-slate-300">
                            <p>rank: {mission.rank}</p>
                            <p>category: {mission.category}</p>
                            <p>
                              research value: {mission.difficulty.research_value}
                            </p>
                            <p>demo value: {mission.difficulty.demo_value}</p>
                            <p className="text-slate-500">
                              {MISSION_RANKS[mission.rank].reason}
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="mt-6 sm:mt-1 grid grid-cols-1 gap-3 md:grid-cols-2">
                        <GameButton
                          onPress={openMissionTerminal}
                          disabled={busy || !steps.length || runActive}
                          className="rounded-xl border border-green-300/40 bg-green-500/10 px-5 py-4 sm:px-2 sm:py-1 font-bold text-green-100 hover:bg-green-400/20 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          {activeSessionId
                            ? "OPEN ACTIVE SESSION"
                            : selectedMissionProgress
                              ? "OPEN SAVED RUN"
                              : "OPEN TACTICAL TERMINAL"}
                        </GameButton>

                        <GameButton
                          onPress={handleMaximizeQueue}
                          disabled={runActive}
                          className="rounded-xl border border-cyan-300/40 bg-cyan-500/10 px-5 py-4 sm:px-2 sm:py-1 font-bold text-cyan-100 hover:bg-cyan-400/20 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          BACK TO QUEUE
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
          )}
        </main>
      </div>
    </div>
  );
}
