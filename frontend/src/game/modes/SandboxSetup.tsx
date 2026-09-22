import { useSelectionStore, useUIStore } from "../../store";
import { useSignalReconStore } from "../../store/signalReconStore";
import { GameButton } from "../../components/GameButton";
import { socket } from "../../net/rustSocket";
import {
    useCanBusStore,
} from "../../store/canBusStore";
import { useCallback, useEffect } from "react";
import SignalReconHeader from "./SignalReconHeader";
import { MapSelector } from "./MapSelector";
import { VehicleSelector } from "./VehicleSelector";

type Sandbox = {
  collapsed: boolean; 
  setCollapsed: (collapsed: boolean)=>void;
}

export function SandboxSetup({collapsed, setCollapsed}: Sandbox) {
    const setScreen = useUIStore((s) => s.setScreen);

    const vehicle = useSelectionStore((s) => s.getSelectedVehicle());
    const map = useSelectionStore((s) => s.getSelectedMap());
    const setVehicleIdentity = useSignalReconStore((s) => s.setVehicleIdentity);
    const setActiveMenuIndex = useUIStore((s) => s.setActiveMenuIndex);
   
    const canStatus = useCanBusStore((s) => s.status);
    const selectedInterface = useCanBusStore((s) => s.selectedInterface);
    const selectedMode = useCanBusStore((s) => s.selectedMode);
    const refreshCanStatus = useCanBusStore((s) => s.refreshStatus);
    

    const selectedInterfaceStatus = canStatus?.[selectedInterface];
    const selectedCaptureKind =
        selectedMode === "simulation" || selectedInterface === "vcan0"
            ? "simulation"
            : "live";

    const canStartSandbox =
        selectedCaptureKind === "simulation" ||
        Boolean(selectedInterfaceStatus?.exists && selectedInterfaceStatus?.up);

    const startSandbox = useCallback(() => {
        if (!canStartSandbox) {
            void refreshCanStatus();
            return;
        }

        setVehicleIdentity(vehicle.canIdentity);

        socket?.send?.(
            JSON.stringify({
                type: "spawn_request",
                vehicle: vehicle.id,
                map: map.id,
                can_vehicle_slug: vehicle.canIdentity.slug,
                can_vehicle_identity: vehicle.canIdentity,
                mode: "sandbox",
                can_interface: selectedInterface,
                can_mode: selectedMode,
                capture_kind: selectedCaptureKind,
            })
        );

        setScreen("sandbox");
    }, [
        canStartSandbox,
        map.id,
        refreshCanStatus,
        selectedCaptureKind,
        selectedInterface,
        selectedMode,
        setScreen,
        setVehicleIdentity,
        vehicle,
    ]);

    const exitSandboxSetup = useCallback(() => {
        setScreen("main");
    }, [setScreen]);


    useEffect(() => {
        void refreshCanStatus();
    }, [refreshCanStatus]);

    useEffect(() => {
        setActiveMenuIndex(0);
    }, [setActiveMenuIndex]);

    useEffect(() => {
        const handleStart = () => startSandbox();
        const handleExit = () => exitSandboxSetup();

        window.addEventListener("avenlab:sandbox-start", handleStart);
        window.addEventListener("avenlab:sandbox-exit", handleExit);

        return () => {
            window.removeEventListener("avenlab:sandbox-start", handleStart);
            window.removeEventListener("avenlab:sandbox-exit", handleExit);
        };
    }, [exitSandboxSetup, startSandbox]);

    return (
        <div className="absolute inset-0 z-10 flex flex-col w-screen text-cyan-100">
            <SignalReconHeader 
                title="REDLINE VECTOR // SANDBOX"
                subtitle="VEHICLE & MAP SELECTION"
                collapsed={collapsed}
                setCollapsed={setCollapsed}
                exitLabel="BACK"
                controlsDisabled={false}
                exitDisabled={false}
                onExit={() => setScreen("main")}
            />
            {/* Selection Components */}
            <div className="absolute bottom-0 left-1/2 z-20 w-full -translate-x-1/2">

                <VehicleSelector 
                    menuId="sandbox_setup"
                    menuIndex={0}
                    showCanSlug={false}
                    showNotes={false}
                />
                <MapSelector menuId="sandbox_setup" menuIndex={1} />

                {/* Persistent controller actions; only Vehicle and Map are navigable. */}
                <div
                    className="border-y border-cyan-400/20 bg-slate-950/85 shadow-[inset_0_0_24px_rgba(0,0,0,0.7)]"
                >
                  <div className="grid grid-cols-2 align-baseline">
                    <GameButton
                        disabled={!canStartSandbox}
                        onPress={startSandbox}
                        className="flex justify-center border-0 bg-transparent"
                    >
                        A&nbsp;&nbsp;START
                    </GameButton>

                    <GameButton
                        variant="danger"
                        onPress={exitSandboxSetup}
                        className="flex justify-center border-0 bg-transparent"
                    >
                        B&nbsp;&nbsp;EXIT
                    </GameButton>
                  </div>
                </div>
            </div>
        </div>
    );
}
