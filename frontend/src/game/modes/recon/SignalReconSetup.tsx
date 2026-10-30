import { useCallback, useEffect, useRef, useState } from "react";
import { useUIStore } from "../../../store/menus/uiStore";
import { useSelectionStore } from "../../../store/selection/selectionStore";
import { useSignalReconStore } from "../../../store/recon/store";
import { useCanBusStore } from "../../../store/recon/canBusStore";
import { GameButton } from "../../../components/GameButton";
import { VehicleSelector } from "../VehicleSelector";
import SignalReconHeader from "./SignalReconHeader";

type SignalReconProps = {
  collapsed: boolean;
  setCollapsed: (collapsed: boolean) => void;
};

export function SignalReconSetup({
  collapsed,
  setCollapsed,
}: SignalReconProps) {
  const setScreen = useUIStore((s) => s.setScreen);
  const selectedIndex = useUIStore(
    (s) => s.selectedMenuIndexById.signal_recon_setup,
  );
  const setIndex = useUIStore((s) => s.setActiveMenuIndex);
  const adjust = useUIStore((s) => s.moveActiveMenuHorizontal);
  const vehicle = useSelectionStore((s) => s.getSelectedVehicle());
  const setVehicleIdentity = useSignalReconStore((s) => s.setVehicleIdentity);
  const canStatus = useCanBusStore((s) => s.status);
  const selectedInterface = useCanBusStore((s) => s.selectedInterface);
  const selectedMode = useCanBusStore((s) => s.selectedMode);
  const refreshCanStatus = useCanBusStore((s) => s.refreshStatus);
  const choices = useRef<HTMLDivElement>(null);
  const [startAttempted, setStartAttempted] = useState(false);
  const interfaceStatus = canStatus?.[selectedInterface];
  const captureKind =
    selectedMode === "simulation" || selectedInterface === "vcan0"
      ? "simulation"
      : "live";
  const canStart =
    captureKind === "simulation" ||
    Boolean(interfaceStatus?.exists && interfaceStatus.up);
  const interfaceLabel = interfaceStatus?.exists
    ? interfaceStatus.up
      ? "UP"
      : "DOWN"
    : "UNAVAILABLE";

  const startSignalRecon = useCallback(() => {
    if (!canStart) {
      setStartAttempted(true);
      void refreshCanStatus();
      return;
    }
    // This mode uses the selected vehicle as a CAN/data profile. Starting the
    // workspace does not spawn a drivable entity or depend on the Rust socket.
    setVehicleIdentity(vehicle.canIdentity);
    setScreen("signal_recon");
  }, [canStart, refreshCanStatus, setScreen, setVehicleIdentity, vehicle]);

  useEffect(() => {
    setIndex(0);
    void refreshCanStatus();
  }, [refreshCanStatus, setIndex]);
  useEffect(() => {
    window.addEventListener("avenlab:signal-recon-start", startSignalRecon);
    return () =>
      window.removeEventListener(
        "avenlab:signal-recon-start",
        startSignalRecon,
      );
  }, [startSignalRecon]);
  useEffect(() => {
    const element = choices.current?.querySelector<HTMLElement>(
      `[data-recon-choice="${selectedIndex}"]`,
    );
    element?.focus({ preventScroll: true });
    element?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  return (
    <div className="game-ui absolute inset-0 z-10 flex w-screen flex-col text-cyan-100">
      <SignalReconHeader
        title="REDLINE VECTOR // SIGNAL RECON"
        subtitle="VEHICLE & CAN SETUP"
        className="garage-selection-header"
        collapsed={collapsed}
        setCollapsed={setCollapsed}
        exitLabel="BACK"
        onExit={() => setScreen("main")}
      />
      {startAttempted && !canStart && (
        <div className="pointer-events-none relative z-40">
          <p
            role="alert"
            className="absolute left-2 right-2 top-2 mx-auto max-w-lg rounded-sm border border-amber-300/50 bg-slate-950/95 px-3 py-2 text-xs text-amber-100 shadow-lg"
          >
            {selectedInterface} is{" "}
            {interfaceStatus?.exists ? "down" : "unavailable"}. Choose an active
            interface or Simulation.
          </p>
        </div>
      )}
      <div
        ref={choices}
        className="garage-selection-controls absolute bottom-0 left-0 z-20 max-h-[65svh] w-full overflow-y-auto"
      >
        <div
          className="grid grid-cols-2"
          role="group"
          aria-label="CAN capture controls"
        >
          <GameButton
            data-recon-choice={0}
            variant="neutral"
            selected={selectedIndex === 0}
            onFocus={() => setIndex(0)}
            onPress={() => {
              setIndex(0);
              adjust(1);
            }}
            className="flex min-h-11 min-w-0 flex-col items-start justify-center px-3 py-1 text-xs"
            aria-label={`CAN interface: ${selectedInterface}`}
          >
            <span className="text-[10px] uppercase tracking-wide text-cyan-200/70">
              CAN interface
            </span>
            <span className="max-w-full truncate font-mono">
              {selectedInterface} · {interfaceLabel}
            </span>
          </GameButton>
          <GameButton
            data-recon-choice={1}
            variant="neutral"
            selected={selectedIndex === 1}
            onFocus={() => setIndex(1)}
            onPress={() => {
              setIndex(1);
              adjust(1);
            }}
            className="flex min-h-11 min-w-0 flex-col items-start justify-center px-3 py-1 text-xs"
            aria-label={`Capture mode: ${selectedMode}`}
          >
            <span className="text-[10px] uppercase tracking-wide text-cyan-200/70">
              Capture mode
            </span>
            <span className="max-w-full truncate font-mono uppercase">
              {selectedMode}
            </span>
          </GameButton>
        </div>
        <div
          data-recon-choice={2}
          tabIndex={0}
          role="group"
          aria-label="Vehicle CAN profile"
          className="outline-none"
          onFocus={() => setIndex(2)}
        >
          <VehicleSelector
            menuId="signal_recon_setup"
            menuIndex={2}
            showRole={false}
            translucent
          />
        </div>
        <div className="relative grid grid-cols-2 border border-cyan-400/30">
          <GameButton
            data-recon-choice={3}
            variant="neutral"
            selected={selectedIndex === 3}
            aria-disabled={!canStart}
            onFocus={() => setIndex(3)}
            onPress={startSignalRecon}
            className={`flex justify-center border-0 ${canStart ? "" : "opacity-50"}`}
          >
            A&nbsp;&nbsp;START
          </GameButton>
          <GameButton
            data-recon-choice={4}
            selected={selectedIndex === 4}
            variant="neutral"
            onFocus={() => setIndex(4)}
            onPress={() => setScreen("main")}
            className="flex justify-center border-0 text-red-100"
          >
            B&nbsp;&nbsp;BACK
          </GameButton>
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 left-1/2 z-10 border-l border-cyan-300/60"
          />
        </div>
      </div>
    </div>
  );
}
