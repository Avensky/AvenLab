import { useCallback, useEffect, useMemo, useState } from "react";
import { useSelectionStore, useUIStore } from "../../store";
import { SignalReconMission } from "./SignalReconMission";
import { GameButton } from "../../components/GameButton";
import { ReconWorkspaceHeader, type ReconHeaderTab } from "./ReconWorkspaceHeader";
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

const RANK_HEADER_TABS: ReconHeaderTab[] = RANK_FILTERS.map((rank) => ({
  id: rank,
  label: rankLabel(rank),
}));

type CaptureKind = "live" | "simulation";
export type MissionTerminalInitialView = "start" | "session" | "playback" | "results";

export type MissionRunSummary = {
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
  capture_quality?: {
    usable_for_analysis?: boolean;
    quality_score?: number;
    action_markers?: number;
    expected_action_markers?: number;
    marker_completion_ratio?: number;
    quality_issue?: string | null;
  };
};

function busModeLabel(mode: CanMode) {
  if (mode === "listen-only") return "LIVE / LISTEN-ONLY";
  if (mode === "live") return "LIVE / ACTIVE";
  return "SIMULATION";
}

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

type SignalReconProps = {
  collapsed: boolean;
  setCollapsed: (collapsed: boolean) => void;
  sidebarHidden: boolean;
  setSidebarHidden: (hidden: boolean) => void;
};

export function SignalRecon({
  collapsed,
  setCollapsed,
  sidebarHidden,
  setSidebarHidden,
}: SignalReconProps) {
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

  const selectedInterface = useCanBusStore((s) => s.selectedInterface);
  const selectedMode = useCanBusStore((s) => s.selectedMode);
  const refreshCanStatus = useCanBusStore((s) => s.refreshStatus);

  const [missionTerminalOpen, setMissionTerminalOpen] = useState(false);
  const [queueMinimized, setQueueMinimized] = useState(false);
  const [terminalInitialSessionId, setTerminalInitialSessionId] = useState<string | null>(null);
  const [terminalInitialView, setTerminalInitialView] = useState<MissionTerminalInitialView>("start");
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
  const [showTabs, setShowTabs] = useState(true);

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

    setShowTabs(false);


    const isSameMission =
      selectedMission?.mission_code === nextMission.mission_code;
    if (isSameMission) {
      setSidebarHidden(false);
      setQueueMinimized(true);
      return;
    }

    setBusy(true);
    setError(null);

    try {
      setTerminalInitialSessionId(null);
      setTerminalInitialView("start");

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

      setSidebarHidden(false);
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

    setShowTabs(false);
    setBusy(true);
    setError(null);

    try {
      if (selectedMission?.mission_code !== mission.mission_code) {
        await selectMission(mission);
      }

      // Review mode first: opening the tactical terminal must not create a new
      // CAN session. SignalReconMission will load the latest saved DB run for
      // this mission, and only RUN STEP / RUN FULL MISSION creates a new one.
      setTerminalInitialSessionId(selectedMissionProgress?.session_id ?? null);
      setTerminalInitialView(selectedMissionProgress ? "session" : "start");
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

  const openSavedSession = async (
    session: MissionRunSummary,
    initialView: Exclude<MissionTerminalInitialView, "start">,
  ) => {
    if (
      busy
      || runActive
      || (session.frame_count <= 0 && initialView === "playback")
    ) return;

    const sessionMission = missions.find(
      (item) => item.mission_code === session.mission_code,
    );

    if (!sessionMission) {
      setError(`Mission ${session.mission_code} is not available in the local catalog.`);
      return;
    }

    setBusy(true);
    setError(null);
    
    try {
      if (selectedMission?.mission_code !== sessionMission.mission_code) {
        await selectMission(sessionMission);
      }
      setTerminalInitialSessionId(session.session_id);
      setTerminalInitialView(initialView);
      setMissionTerminalOpen(true);
      setQueueMinimized(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to open the saved session.");
    } finally {
      setBusy(false);
    }
  };

  const deleteSavedSession = async (session: MissionRunSummary) => {
    if (busy || runActive || activeSessionId === session.session_id) return;

    const confirmed = window.confirm(
      `Delete ${session.mission_code} session ${session.session_id.slice(0, 8)}…?\n\n` +
      `${session.frame_count.toLocaleString()} frames and ${session.marker_count} markers will be removed. ` +
      "Saved analysis and labels for this session will also be deleted.",
    );
    if (!confirmed) return;

    setBusy(true);
    setError(null);
    try {
      const response = await fetch(
        `${getApiBaseUrl()}/data/can/session/${session.session_id}`,
        { method: "DELETE" },
      );
      const data = (await response.json().catch(() => ({}))) as {
        ok?: boolean;
        detail?: string;
        error?: string;
      };
      if (!response.ok || data.ok === false) {
        throw new Error(
          typeof data.detail === "string"
            ? data.detail
            : typeof data.error === "string"
              ? data.error
              : `Session delete failed with HTTP ${response.status}.`,
        );
      }
      if (terminalInitialSessionId === session.session_id) {
        setTerminalInitialSessionId(null);
        setTerminalInitialView("start");
      }
      await refreshMissionProgressFromDb();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete the saved session.");
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

    setSidebarHidden(false);
    setScreen("signal_recon_setup");
  };

  const handleMaximizeQueue = () => {
    if (runActive) return;
    setShowTabs(true);
    setMissionTerminalOpen(false);
    setQueueMinimized(false);
    setSidebarHidden(false);
    setTerminalInitialSessionId(null);
    setTerminalInitialView("start");
  };

  const handleMissionClosed = () => {
    if (runActive) return;
    setMissionTerminalOpen(false);
    setQueueMinimized(true);
    setSidebarHidden(false);
    setTerminalInitialSessionId(null);
    setTerminalInitialView("start");
  };

  // The rank header belongs only to the full mission database. Review and
  // Tactical Terminal modes use their own compact action navigation.
  const showMissionDatabaseHeader = !missionTerminalOpen;
  const showMissionList =
    !missionTerminalOpen && (!queueMinimized || !sidebarHidden);
  const showTerminalPane = queueMinimized || missionTerminalOpen;

  return (
    <div className="relative flex h-full w-screen flex-col overflow-hidden bg-[#020617] text-green-100">
      {/* <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(34,197,94,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(34,197,94,0.05)_1px,transparent_1px)] bg-[size:32px_32px]" /> */}

      {/* <div className="relative z-10 flex h-full min-h-0 flex-col overflow-hidden p-2 sm:p-3"> */}
        {showMissionDatabaseHeader && (
          <ReconWorkspaceHeader
            theme="cyan"
            eyebrow="SIGNAL RECON // MISSION DATABASE"
            title={mission?.title ?? "Missions Database"}
            meta={mission ? `${mission.mission_code} · ${mission.target}` : "Select a mission"}
            collapsed={collapsed}
            setCollapsed={setCollapsed}
            showTabs={showTabs} 
            tabs={RANK_HEADER_TABS.map((tab) => ({
              ...tab,
              disabled: runActive || sessionActive,
            }))}
            activeTab={selectedRank}
            onTabChange={(tabId) => setSelectedRank(tabId as MissionRank | "ALL")}
            status={
              <span>
                {visibleMissions.length}/{missions.length} MISSIONS · {selectedInterface}/{busModeLabel(selectedMode)}
                {missionProgressLoading ? " · DB SYNC" : ""}
                {missionProgressError ? " · DB ERROR" : ""}
              </span>
            }
            actions={
              <div className="grid grid-cols-1 items-end space-y-0.5">
                <GameButton
                  onPress={() => void refreshMissionProgressFromDb()}
                  disabled={missionProgressLoading}
                  className="rounded-sm border flex justify-center border-cyan-300/40 bg-cyan-500/10 text-[9px] font-black text-cyan-100 hover:bg-cyan-400/20 disabled:opacity-40"
                >
                  {missionProgressLoading ? "SYNCING" : "REFRESH"}
                </GameButton>
                <GameButton
                  onPress={() => {
                    if (!mission) return;
                    setSidebarHidden(false);
                    setQueueMinimized(true);
                  }}
                  disabled={!mission}
                  className="px-1.5 rounded-sm border flex justify-center items-center border-green-400/25 order-green-600 bg-green-500/10 text-[9px] font-black text-green-100 hover:bg-slate-800 disabled:opacity-40"
                >
                  TERMINAL
                </GameButton>
                <div className="flex gap-0.5 justify-end">
                  <GameButton
                    variant="danger"
                    disabled={busy || runActive}
                    onPress={() => void handleExit()}
                    className=" rounded-sm border flex justify-center  border-red-300/40 px-1.5 text-[9px] font-black"
                  >
                    BACK
                  </GameButton>
                  
                    <button
                      type="button"
                      onClick={() => setCollapsed(true)}
                      className={`shrink-0 border rounded-sm bg-slate-900 border-cyan-400/25 px-1 flex items-center text-[9px] font-black text-slate-300`}
                      aria-label="Hide workspace header"
                      title="Hide header"
                    >
                      ▴
                    </button>
                </div>
              </div>
            }
          />
        )}

        <main
          className={`grid min-h-0 flex-1 overflow-hidden ${
            missionTerminalOpen || (queueMinimized && sidebarHidden)
              ? "grid-cols-1"
              : queueMinimized
                ? "grid-cols-[56px_minmax(0,1fr)] sm:grid-cols-[72px_minmax(0,1fr)] lg:grid-cols-[96px_minmax(0,1fr)]"
                : "grid-cols-1"
          }`}
        >
          {showMissionList && (
          <section
            className={`flex flex-col self-stretch overflow-hidden transition-all ${queueMinimized
              ? "w-[56px] sm:w-[72px] lg:w-[96px]"
              : "w-full"
              }`}
            >
            {queueMinimized ? (
              <div className="flex flex-col w-full game-ui">
                <div className="grid grid-cols-1 gap-px bg-slate-800">
                  <GameButton
                    onPress={handleMaximizeQueue}
                    className="flex h-8 w-full items-center justify-center rounded-none border border-cyan-300/30 bg-cyan-500/10 font-mono text-[9px] font-black text-cyan-100 hover:bg-cyan-400/20 sm:text-[10px]"
                  >
                    MISSIONS
                  </GameButton>
                  <GameButton
                    onPress={() => setSidebarHidden(true)}
                    className="flex h-6 w-full items-center justify-center rounded-none border border-slate-700 bg-slate-950 font-mono text-[8px] font-black text-slate-400 hover:bg-slate-900"
                  >
                    HIDE
                  </GameButton>
                </div>

                <div className="flex flex-1 flex-col game-ui">
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
                        className={`flex w-full px-1 py-2 flex-col items-center justify-center border text-center font-mono text-[10px] font-black leading-tight transition disabled:cursor-not-allowed disabled:opacity-30 sm:text-xs ${selected
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
                {error && (
                  <div className="mb-3 rounded-xl border border-red-300/40 bg-red-500/10 p-3 text-sm text-red-100">
                    {error}
                  </div>
                )}

                {missionProgressError && (
                  <div className="px-2 py-1 border-t border-yellow-300/40 bg-yellow-500/10 text-sm text-yellow-100">
                    DB mission progress unavailable: {missionProgressError}
                  </div>
                )}

                <div className="h-full game-ui flex-1 pb-4">
                  {visibleMissions.map((item) => {
                    const selected =
                      mission?.mission_code === item.mission_code;
                    // const disabled = busy || runActive;
                    const progress = missionProgressByCode[item.mission_code];

                    return (
                      <div
                        // key={item.mission_code}
                        // disabled={disabled}
                        // onPress={() => void handleSelectMission(item)}
                        className={`w-full  text-left transition disabled:cursor-not-allowed disabled:opacity-40 ${selected
                          ? "border-t border-green-300 bg-green-500/15"
                          : "border-t border-slate-700 bg-slate-900/80 hover:bg-slate-800"
                          }`}
                      >
                        <div className="px-2 flex flex-row justify-between">
                          <div className="flex flex-col items-start justify-between">
                          
                            <h3 className="font-bold text-green-100">  
                              {item.title}
                            </h3>

                            <span className="font-mono text-xs text-yellow-300">
                              {item.mission_code}
                            </span>
                            <div className="grid font-mono text-xs text-slate-500">
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
                            
                          </div>

                          <div className="flex shrink-0 items-center">
                            <span
                              onClick={() => void handleSelectMission(item)}
                              className={` border px-2 py-1 text-[10px] font-bold ${missionProgressClass(progress, item)}`}
                              >
                              {missionProgressLabel(progress, item)}
                            </span>
                            <span
                              className={`border px-2 py-1 text-[10px] font-bold ${rankClass(item.rank)}`}
                              >
                              {item.rank === "BASELINE"
                                ? "BASELINE"
                                : `RANK ${item.rank}`}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </section>
          )}

          {showTerminalPane && (
            <section className="h-full game-ui relative transition-all bg-black/80 font-mono shadow-xl shadow-green-500/10">
              {queueMinimized && sidebarHidden && !missionTerminalOpen && (
                <button
                  type="button"
                  onClick={() => setSidebarHidden(false)}
                  className="absolute left-0 top-0 z-40 border border-cyan-300/30 bg-slate-950 px-1 py-2 text-[9px] font-black text-cyan-200"
                  aria-label="Show mission sidebar"
                  title="Show mission sidebar"
                >
                  ▸
                </button>
              )}
              {missionTerminalOpen ? (
                <SignalReconMission
                  key={`${mission?.mission_code ?? "none"}:${terminalInitialSessionId ?? "latest"}:${terminalInitialView}`}
                  onExit={handleMissionClosed}
                  collapsed={collapsed}
                  setCollapsed={setCollapsed}
                  initialSessionId={terminalInitialSessionId ?? selectedMissionProgress?.session_id ?? null}
                  initialView={terminalInitialView}
                  initialMissionProgress={selectedMissionProgress ?? null}
                  sessionHistory={selectedMissionSessions}
                  onDatabaseChanged={() => void refreshMissionProgressFromDb()}
                  handleMaximizeQueue={handleMaximizeQueue}
                />
              ) : (
                <div className="h-full px-2 pb-2 flex flex-col game-ui">
                  {/* <div className="px-2"> */}

                    <div className="mb-1 pb-1 flex items-center justify-between border-b border-green-400/20">
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

                        <div className="mt-1 grid lg:grid-cols-[1fr_0.85fr]">
                          <div className="border-t border-green-400/20 bg-slate-950">
                            <h3 className="font-bold text-yellow-300">
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

                          <div className="mt-1 border-t border-green-400/20 bg-slate-950">
                            <h3 className="sm:mb-1 font-bold text-yellow-300">
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

                      
                      </>
                    ) : (
                      <div className="rounded-xl border border-yellow-300/40 bg-yellow-500/10 p-4 text-yellow-100">
                        No Signal Recon missions are loaded.
                      </div>
                    )}
                  <div className="mt-2 h-full border-t border-cyan-400/20 py-1">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="font-bold text-cyan-200">Recent Mission Sessions</h3>
                        <p className="text-[10px] text-slate-500">
                          Review, play back, inspect results, or delete runs for the selected mission.
                        </p>
                      </div>
                      <span className="text-[10px] text-slate-500">
                        {selectedMissionSessions.length} RUN{selectedMissionSessions.length === 1 ? "" : "S"}
                      </span>
                    </div>

                    <div className="my-1 space-y-1 overflow-y-auto flex flex-col justify-between ">
                      {selectedMissionSessions.slice(0, 12).map((session) => {
                        const empty = session.frame_count <= 0;
                        return (
                          <div
                            key={session.session_id}
                            className={`border px-2 py-1 ${empty
                              ? "border-red-300/30 bg-red-500/5"
                              : "border-slate-700 bg-slate-900/70"
                            }`}
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="min-w-0 text-[10px]">
                                <p className="truncate font-black text-green-100">
                                  {session.mission_code} · {session.session_id.slice(0, 8)}… · {session.source_label}
                                </p>
                                <p className="truncate text-slate-500">
                                  {session.frame_count.toLocaleString()} frames · {session.marker_count} markers
                                  {session.top_can_id_hex ? ` · ${session.top_can_id_hex} ${formatConfidence(session.confidence)}` : ""}
                                </p>
                                {session.capture_quality?.quality_issue && (
                                  <p className="truncate text-red-300">
                                    {session.capture_quality.quality_issue}
                                  </p>
                                )}
                              </div>
                              <div className="flex flex-wrap gap-1">
                                <GameButton
                                  onPress={() => void openSavedSession(session, "session")}
                                  disabled={busy || runActive}
                                  className="border border-green-300/30 bg-green-500/10 px-1.5 py-0.5 text-[9px] font-bold text-green-100 disabled:opacity-40"
                                >
                                  REVIEW
                                </GameButton>
                                <GameButton
                                  onPress={() => void openSavedSession(session, "playback")}
                                  disabled={busy || runActive || empty}
                                  className="border border-purple-300/30 bg-purple-500/10 px-1.5 py-0.5 text-[9px] font-bold text-purple-100 disabled:opacity-40"
                                >
                                  PLAYBACK
                                </GameButton>
                                <GameButton
                                  onPress={() => void openSavedSession(session, "results")}
                                  disabled={busy || runActive || !session.analyzed}
                                  className="border border-cyan-300/30 bg-cyan-500/10 px-1.5 py-0.5 text-[9px] font-bold text-cyan-100 disabled:opacity-40"
                                >
                                  RESULTS
                                </GameButton>
                                <GameButton
                                  onPress={() => void deleteSavedSession(session)}
                                  disabled={busy || runActive || activeSessionId === session.session_id}
                                  className="border border-red-300/30 bg-red-500/10 px-1.5 py-0.5 text-[9px] font-bold text-red-100 disabled:opacity-40"
                                >
                                  DELETE
                                </GameButton>
                              </div>
                            </div>
                          </div>
                        );
                      })}

                      {!selectedMissionSessions.length && (
                        <div className="border border-slate-700 bg-slate-900/60 px-2 py-2 text-xs text-slate-500">
                          No saved sessions for the selected mission yet.
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex">
                    <GameButton
                      onPress={openMissionTerminal}
                      disabled={busy || !steps.length || runActive}
                      className="flex justify-center w-1/2 border border-green-300/40 bg-green-500/10 font-bold text-green-100 hover:bg-green-400/20 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {activeSessionId
                        ? "SESSION"
                        : selectedMissionProgress
                          ? "REVIEW"
                          : "TERMINAL"}
                    </GameButton>

                    <GameButton
                      onPress={handleMaximizeQueue}
                      disabled={runActive}
                      className="flex justify-center w-1/2 border border-cyan-300/40 bg-cyan-500/10 font-bold text-cyan-100 hover:bg-cyan-400/20 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      LIST
                    </GameButton>
                  </div>
                  {/* </div>  */}
                  
                </div>
              )}
            </section>
          )}
        </main>
      {/* </div> */}
    </div>
  );
}