import { CanCaptureDropdowns } from "./CanCaptureSelectors";
import { ControllerButton } from "../../../components/controller";
import { type ReactNode } from "react";
import { GameButton } from "../../../components/GameButton";
import {
  ReconWorkspaceHeader,
  type ReconHeaderTheme,
} from "./ReconWorkspaceHeader";
import { useSelectionStore, useSignalReconStore } from "../../../store";
import { useCanBusStore, type CanMode } from "../../../store/recon/canBusStore";
import type { MissionRunSummary } from "./SignalRecon";

const THEME_CLASSES: Record<
  ReconHeaderTheme,
  {
    border: string;
    title: string;
    active: string;
    glow: string;
  }
> = {
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
  showCanControls?: boolean;
  showStatus?: boolean;
  exitDisabled?: boolean;
  showExit?: boolean;
  exitLabel?: string;
  exitVariant?: "danger" | "neutral";
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
  showCanControls = true,
  showStatus = true,
  exitDisabled = false,
  showExit = true,
  exitLabel = "EXIT",
  exitVariant = "danger",
  onExit,
  actions,
  className = "",
}: SignalReconHeaderProps) {
  const theme = "cyan" as const;
  const tone = THEME_CLASSES[theme];
  const selectedMode = useCanBusStore((state) => state.selectedMode);

  const selectedVehicle = useSelectionStore((state) =>
    state.getSelectedVehicle(),
  );
  const activeSessionId = useSignalReconStore((state) => state.activeSessionId);
  const activePhase = useSignalReconStore((state) => state.activePhase);

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
      meta={
        showStatus
          ? `${selectedVehicle.name} · ${selectedVehicle.canIdentity.slug}`
          : undefined
      }
      status={
        showStatus ? (
          <span>
            {activeSessionId
              ? `SESSION ${activeSessionId.slice(0, 8)}…${activeSessionId.slice(-4)}`
              : "NO ACTIVE SESSION"}
            {` · ${activePhase.toUpperCase()} · ${busModeLabel(selectedMode)}`}
            {status ? ` · ${status}` : ""}
            {missionProgressLoading ? " · DB SYNC" : ""}
            {!missionProgressLoading && databaseRunCount !== null
              ? ` · ${databaseRunCount} DB RUNS`
              : ""}
          </span>
        ) : undefined
      }
      className={className}
      actions={
        <div className="grid col-1 space-y-0.5">
          {showCanControls && (
            <CanCaptureDropdowns disabled={controlsDisabled} />
          )}

          {actions}

          <div className="flex justify-end gap-0.5">
            {showExit && onExit ? (
              <GameButton
                variant={exitVariant}
                disabled={exitDisabled}
                onPress={onExit}
                className="controller-action text-[9px] font-black"
              >
                <ControllerButton button="B" /> {exitLabel}
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
        </div>
      }
    />
  );
}
