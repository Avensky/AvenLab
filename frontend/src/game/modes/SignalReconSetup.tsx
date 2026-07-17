import { useSelectionStore, useUIStore } from "../../store";
import { useSignalReconStore } from "../../store/signalReconStore";
import { GameButton } from "../../components/GameButton";
import { socket } from "../../net/rustSocket";
import {
    useCanBusStore,
} from "../../store/canBusStore";
import { useEffect } from "react";
import SignalReconHeader from "./SignalReconHeader";


export function SignalReconSetup() {
    const setScreen = useUIStore((s) => s.setScreen);

    const vehicle = useSelectionStore((s) => s.getSelectedVehicle());
    const setVehicleIdentity = useSignalReconStore((s) => s.setVehicleIdentity);
    // const map = useSelectionStore((s) => s.getSelectedMap());
    const selectedIndex = useUIStore((s) => s.selectedMenuIndexById.signal_recon_setup);
    const setActiveMenuIndex = useUIStore((s) => s.setActiveMenuIndex);

    const nextVehicle = useSelectionStore((s) => s.nextVehicle);
    const prevVehicle = useSelectionStore((s) => s.prevVehicle);
   
    const canStatus = useCanBusStore((s) => s.status);
    const selectedInterface = useCanBusStore((s) => s.selectedInterface);
    const selectedMode = useCanBusStore((s) => s.selectedMode);
    const refreshCanStatus = useCanBusStore((s) => s.refreshStatus);
    

    const selectedInterfaceStatus = canStatus?.[selectedInterface];
    const selectedCaptureKind =
        selectedMode === "simulation" || selectedInterface === "vcan0"
            ? "simulation"
            : "live";

    const canStartSignalRecon =
        selectedCaptureKind === "simulation" ||
        Boolean(selectedInterfaceStatus?.exists && selectedInterfaceStatus?.up);

    const startSignalRecon = () => {
        if (!canStartSignalRecon) {
            void refreshCanStatus();
            return;
        }

        setVehicleIdentity(vehicle.canIdentity);

        socket?.send?.(
            JSON.stringify({
                type: "spawn_request",
                vehicle: vehicle.id,
                can_vehicle_slug: vehicle.canIdentity.slug,
                can_vehicle_identity: vehicle.canIdentity,
                mode: "signal_recon",
                can_interface: selectedInterface,
                can_mode: selectedMode,
                capture_kind: selectedCaptureKind,
            })
        );

        setScreen("signal_recon");
    };


    useEffect(() => {
        void refreshCanStatus();
    }, [refreshCanStatus]);

    return (
        <div className="absolute inset-0 z-10 flex flex-col w-screen text-cyan-100">
            <SignalReconHeader />
            {/* Selection Components */}
            <div className="absolute bottom-0 left-1/2 z-20 w-full -translate-x-1/2">

                {/* Vehicle */}
                <div className={`px-4 border-t  ${selectedIndex === 0
                    ? "border-yellow-300/80 bg-yellow-400/10"
                    : "border-cyan-400/20 bg-slate-950/45"
                    }`}
                    onPointerEnter={() => setActiveMenuIndex(0)}
                >
                    <p className="text-xs uppercase text-slate-500">
                        Vehicle
                    </p>

                    <div className="flex items-center justify-between gap-3">
                        <GameButton variant="secondary" onPress={prevVehicle}>
                            ◀
                        </GameButton>

                        <div className="min-w-0 flex-1 text-center">
                            <h2 className="truncate text-2xl font-black text-cyan-100">
                                {vehicle.name}
                            </h2>

                            <p className="text-sm uppercase text-yellow-300">
                                Role: {vehicle.role}
                            </p>
                            <p className="truncate font-mono text-xs text-cyan-300">
                                CAN: {vehicle.canIdentity.slug}
                            </p>
                            <p className="truncate text-[11px] text-slate-400">
                                {vehicle.canIdentity.notes}
                            </p>
                        </div>

                        <GameButton variant="secondary" onPress={nextVehicle}>
                            ▶
                        </GameButton>
                    </div>
                </div>

                {/* Actions */}
                <div className="grid grid-cols-2">
                    <GameButton
                        selected={selectedIndex === 2}
                        disabled={!canStartSignalRecon}
                        onFocus={() => setActiveMenuIndex(2)}
                        onPress={startSignalRecon}
                        className="border-t"
                    >
                        START
                    </GameButton>

                    <GameButton
                        selected={selectedIndex === 3}
                        variant="danger"
                        onFocus={() => setActiveMenuIndex(3)}
                        onPress={() => setScreen("main")}
                        className="border-t border-l"
                    >
                        EXIT
                    </GameButton>
                </div>
            </div>
        </div>
    );
}