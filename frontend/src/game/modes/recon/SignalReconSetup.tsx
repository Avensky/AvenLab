import { CanCaptureSelectors } from "./CanCaptureSelectors";
import {
  captureReady,
  prepareReconSelection,
} from "../../../store/recon/captureSetup";
import { reconSetupParent } from "../../../store/alpha/alphaStore";
import { useCallback, useEffect, useRef, useState } from "react";
import { useUIStore } from "../../../store/menus/uiStore";
import { useCanBusStore } from "../../../store/recon/canBusStore";
import { ControllerAction } from "../../../components/controller";
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
  const canStatus = useCanBusStore((s) => s.status);
  const selectedInterface = useCanBusStore((s) => s.selectedInterface);
  const selectedMode = useCanBusStore((s) => s.selectedMode);
  const refreshCanStatus = useCanBusStore((s) => s.refreshStatus);
  const choices = useRef<HTMLDivElement>(null);
  const [startAttempted, setStartAttempted] = useState(false);
  const interfaceStatus = canStatus?.[selectedInterface];
  const canStart = captureReady(selectedInterface, selectedMode, canStatus);

  const startSignalRecon = useCallback(() => {
    if (!canStart) {
      setStartAttempted(true);
      void refreshCanStatus();
      return;
    }
    // This mode uses the selected vehicle as a CAN/data profile. Starting the
    // workspace does not spawn a drivable entity or depend on the Rust socket.
    prepareReconSelection();
    setScreen("signal_recon");
  }, [canStart, refreshCanStatus, setScreen]);

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
        <CanCaptureSelectors selectedIndex={selectedIndex} onFocus={setIndex} />
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
          <ControllerAction button="A"
            data-recon-choice={3}

            data-selected={selectedIndex === 3}
            aria-disabled={!canStart}
            onFocus={() => setIndex(3)}
            onClick={startSignalRecon}
            className={`flex justify-center border-0 ${canStart ? "" : "opacity-50"}`}
          >
            START
          </ControllerAction>
          <ControllerAction button="B"
            data-recon-choice={4}
            data-selected={selectedIndex === 4}

            onFocus={() => setIndex(4)}
            onClick={() => setScreen(reconSetupParent())}
            className="flex justify-center border-0 text-red-100"
          >
            BACK
          </ControllerAction>
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 left-1/2 z-10 border-l border-cyan-300/60"
          />
        </div>
      </div>
    </div>
  );
}
