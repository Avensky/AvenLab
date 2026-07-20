import { useMemo, type ReactNode } from "react";
import { GameButton } from "../../components/GameButton";
import { useSelectionStore, useSignalReconStore } from "../../store";
import {
  useCanBusStore,
  type CanInterface,
  type CanMode,
} from "../../store/canBusStore";
import type { MissionRunSummary } from "./SignalRecon";

const CAN_INTERFACE_OPTIONS: readonly CanInterface[] = [
  "can0",
  "can1",
  "can2",
  "vcan0",
];

const CAN_MODE_OPTIONS: readonly CanMode[] = [
  "listen-only",
  "simulation",
  "live",
];

export type SignalReconHeaderProps = {
  title?: string;
  subtitle?: string;
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
  const vehicleSlug = useSignalReconStore((state) => state.vehicleSlug);

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
    <header
      className={`relative z-20 flex shrink-0 items-start justify-between gap-3 border-b border-cyan-400/30 bg-slate-950/90 p-2 shadow-2xl shadow-cyan-500/20 ${className}`}
    >
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-[0.28em] text-yellow-300 sm:text-xs sm:tracking-[0.4em]">
          {title}
        </p>

        <h1 className="truncate text-2xl font-black text-cyan-100">
          {subtitle}
        </h1>

        <p className="truncate font-mono text-[10px] text-slate-500 sm:text-xs">
          {selectedVehicle.name} · {vehicleSlug}
          {activeSessionId
            ? ` · session ${activeSessionId.slice(0, 8)}…${activeSessionId.slice(-4)}`
            : ""}
          {` · ${activePhase.toUpperCase()}`}
          {` · ${busModeLabel(selectedMode)}`}
          {status ? ` · ${status}` : ""}
          {missionProgressLoading ? " · DB SYNC" : ""}
          {!missionProgressLoading && databaseRunCount !== null
            ? ` · ${databaseRunCount} DB RUNS`
            : ""}
        </p>
      </div>

      <div className="font-mono text-xs text-slate-400 flex items-end justify-end flex-col">
        <label className="flex">
          <span className="text-[10px] tracking-[0.24em] text-slate-500">
            IFACE:
          </span>
          <select
            value={selectedInterface}
            disabled={controlsDisabled}
            onChange={(event) =>
              setSelectedInterface(event.target.value as CanInterface)
            }
            className="rounded-sm border border-green-400/30 bg-slate-950 font-mono text-xs font-bold text-green-100 outline-none transition hover:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-40"
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

        <label className="flex m-1">
          <span className="text-[10px] tracking-[0.24em] text-slate-500">
            MODE:
          </span>
          <select
            value={selectedMode}
            disabled={controlsDisabled}
            onChange={(event) =>
              setSelectedMode(event.target.value as CanMode)
            }
            className="rounded-sm border border-green-400/30 bg-slate-950 font-mono text-xs font-bold text-green-100 outline-none transition hover:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-40 "
          >
            {CAN_MODE_OPTIONS.map((mode) => (
              <option key={mode} value={mode}>
                {mode.toUpperCase()}
              </option>
            ))}
          </select>
        </label>

        {actions}

        {showExit && onExit && (
          <GameButton
            variant="danger"
            disabled={exitDisabled}
            onPress={onExit}
            className="rounded-sm text-center"
          >
            {exitLabel}
          </GameButton>
        )}
      </div>
    </header>
  );
}
