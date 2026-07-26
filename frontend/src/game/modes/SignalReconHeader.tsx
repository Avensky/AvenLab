import { useMemo, type ReactNode } from "react";
import { GameButton } from "../../components/GameButton";
import { ReconWorkspaceHeader, type ReconHeaderTheme } from "./ReconWorkspaceHeader";
import { useSelectionStore, useSignalReconStore } from "../../store";
import {
  useCanBusStore,
  type CanInterface,
  type CanMode,
} from "../../store/canBusStore";
import type { MissionRunSummary } from "./SignalRecon";

const THEME_CLASSES: Record<ReconHeaderTheme, {
  border: string;
  title: string;
  active: string;
  glow: string;
}> = {
  green: {
    border: "border-green-400/25",
    title: "text-green-100",
    active: "border-green-300 bg-green-500/20 text-green-100",
    glow: "shadow-green-500/10",
  },
  cyan: {
    border: "border-cyan-400/25",
    title: "text-cyan-100",
    active: "border-cyan-300 bg-cyan-500/20 text-cyan-100",
    glow: "shadow-cyan-500/10",
  },
  purple: {
    border: "border-purple-400/25",
    title: "text-purple-100",
    active: "border-purple-300 bg-purple-500/20 text-purple-100",
    glow: "shadow-purple-500/10",
  },
  red: {
    border: "border-red-300/30",
    title: "text-red-100",
    active: "border-red-300 bg-red-500/20 text-red-100",
    glow: "shadow-red-500/10",
  },
  yellow: {
    border: "border-yello-300/40",
    title: "text-yellow-100",
    active: "border-yellow-300 bg-yellow-500/10 text-yellow-100",
    glow: "shadow-yellow-500/10",
  },
};
const CAN_INTERFACE_OPTIONS: readonly CanInterface[] = [
  "can0",
  "can1",
  "can2",
  "vcan0",
];

const CAN_MODE_OPTIONS: readonly CanMode[] = [
  "live",
  "listen-only",
  "simulation",
];

export type SignalReconHeaderProps = {
  title?: string;
  subtitle?: string;
  collapsible?: boolean;
  collapsed: boolean;
  setCollapsed: (collapsed: boolean) => void;
  defaultCollapsed?: boolean;
  status?: string;
  missionProgressLoading?: boolean;
  missionProgressByCode?: Record<string, MissionRunSummary>;
  controlsDisabled?: boolean;
  exitDisabled?: boolean;
  showExit?: boolean;
  exitLabel?: string;
  onExit?: () => void;
  actions?: ReactNode;
  className?: string;
};

function busModeLabel(mode: CanMode) {
  if (mode === "listen-only") return "LIVE / LISTEN-ONLY";
  if (mode === "live") return "LIVE / ACTIVE";
  return "SIMULATION";
}

export default function SignalReconHeader({
  title = "NIWC // CAN SIGNAL ACQUISITION",
  subtitle = "SIGNAL RECON",
  collapsible = true,
  collapsed,
  setCollapsed,
  status,
  missionProgressLoading = false,
  missionProgressByCode,
  controlsDisabled = false,
  exitDisabled = false,
  showExit = true,
  exitLabel = "EXIT",
  onExit,
  actions,
  className = "",
}: SignalReconHeaderProps) {
  const theme = "cyan" as const;
  const tone = THEME_CLASSES[theme];
  const canStatus = useCanBusStore((state) => state.status);
  const selectedInterface = useCanBusStore(
    (state) => state.selectedInterface,
  );
  const selectedMode = useCanBusStore((state) => state.selectedMode);
  const setSelectedInterface = useCanBusStore(
    (state) => state.setSelectedInterface,
  );
  const setSelectedMode = useCanBusStore(
    (state) => state.setSelectedMode,
  );
  
  const selectedVehicle = useSelectionStore(
    (state) => state.getSelectedVehicle(),
  );
  const activeSessionId = useSignalReconStore(
    (state) => state.activeSessionId,
  );
  const activePhase = useSignalReconStore((state) => state.activePhase);

  const availableInterfaces = useMemo(() => {
    if (!canStatus) return [...CAN_INTERFACE_OPTIONS];

    const available = CAN_INTERFACE_OPTIONS.filter((iface) => {
      const interfaceStatus = canStatus[iface];
      return interfaceStatus?.exists || iface === selectedInterface;
    });

    return available.length ? available : [...CAN_INTERFACE_OPTIONS];
  }, [canStatus, selectedInterface]);

  const databaseRunCount = missionProgressByCode
    ? Object.keys(missionProgressByCode).length
    : null;

  return (
    <ReconWorkspaceHeader
      theme={theme}
      eyebrow={title}
      title={subtitle}
      collapsed={collapsed}
      setCollapsed={setCollapsed}
      collapsible={collapsible}
      meta={`${selectedVehicle.name} · ${selectedVehicle.canIdentity.slug}`}
      status={<span>
        {activeSessionId
          ? `SESSION ${activeSessionId.slice(0, 8)}…${activeSessionId.slice(-4)}`
          : "NO ACTIVE SESSION"}
        {` · ${activePhase.toUpperCase()} · ${busModeLabel(selectedMode)}`}
        {status ? ` · ${status}` : ""}
        {missionProgressLoading ? " · DB SYNC" : ""}
        {!missionProgressLoading && databaseRunCount !== null
          ? ` · ${databaseRunCount} DB RUNS`
          : ""}
      </span>}
      className={className}
      actions={<div className="grid col-1 space-y-0.5">
        <label className="flex h-4 min-w-0 items-center rounded-sm border border-cyan-400/25 bg-slate-950 px-1 py-0.5">
          <span className="mr-1 text-[8px] tracking-[0.18em] text-slate-500">IFACE</span>
          <select
            value={selectedInterface}
            disabled={controlsDisabled}
            onChange={(event) => setSelectedInterface(event.target.value as CanInterface)}
            className="min-w-0 bg-slate-950 font-mono text-[9px] font-bold uppercase text-green-100 outline-none disabled:opacity-40"
          >
            {availableInterfaces.map((iface) => {
              const interfaceStatus = canStatus?.[iface];
              const label = interfaceStatus?.up === false ? `${iface} · DOWN` : iface;
              return <option key={iface} value={iface}>{label}</option>;
            })}
          </select>
        </label>

        <label className="flex h-4 min-w-0 items-center rounded-sm border border-cyan-400/25 bg-slate-950 px-1 py-0.5">
          <span className="mr-1 text-[8px] tracking-[0.18em] text-slate-500">MODE</span>
          <select
            value={selectedMode}
            disabled={controlsDisabled}
            onChange={(event) => setSelectedMode(event.target.value as CanMode)}
            className="min-w-0 bg-slate-950 font-mono text-[9px] font-bold text-green-100 outline-none disabled:opacity-40"
          >
            {CAN_MODE_OPTIONS.map((mode) => (
              <option key={mode} value={mode}>{mode.toUpperCase()}</option>
            ))}
          </select>
        </label>

        {actions}

        <div className="flex justify-end gap-0.5">
          {showExit && onExit ? (
            <GameButton
            variant="danger"
            disabled={exitDisabled}
            onPress={onExit}
            className="h-4 rounded-sm border border-red-300/40 px-2 text-[9px] font-black"
            >
              {exitLabel}
            </GameButton>
          ) : null}
          {collapsible ? (
            <button
            type="button"
            onClick={() => setCollapsed(true)}
            className={`shrink-0 border rounded-sm bg-slate-900 px-1 flex items-center text-[9px] font-black text-slate-300 ${tone.border}`}
            aria-label="Hide workspace header"
            title="Hide header"
            >
                  ▴
                </button>
              ) : null}
        </div>
      </div>}   
    />
  );
}