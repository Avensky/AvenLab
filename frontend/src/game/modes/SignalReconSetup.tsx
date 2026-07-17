import { useSelectionStore, useUIStore } from "../../store";
import { useSignalReconStore } from "../../store/signalReconStore";
import { GameButton } from "../../components/GameButton";
import { socket } from "../../net/rustSocket";
import {
    useCanBusStore,
    type CanInterface,
    type CanMode,
} from "../../store/canBusStore";
import { useEffect, useMemo } from "react";


export function SignalReconSetup() {
    const setScreen = useUIStore((s) => s.setScreen);

    const vehicle = useSelectionStore((s) => s.getSelectedVehicle());
    const setVehicleIdentity = useSignalReconStore((s) => s.setVehicleIdentity);
    // const map = useSelectionStore((s) => s.getSelectedMap());
    const selectedIndex = useUIStore((s) => s.selectedMenuIndexById.signal_recon_setup);
    const setActiveMenuIndex = useUIStore((s) => s.setActiveMenuIndex);

    const nextVehicle = useSelectionStore((s) => s.nextVehicle);
    const prevVehicle = useSelectionStore((s) => s.prevVehicle);


    const CAN_INTERFACE_OPTIONS: CanInterface[] = ["can0", "can1", "can2", "vcan0"];
    const CAN_MODE_OPTIONS: CanMode[] = ["listen-only", "simulation", "live"];

    const canStatus = useCanBusStore((s) => s.status);
    const selectedInterface = useCanBusStore((s) => s.selectedInterface);
    const selectedMode = useCanBusStore((s) => s.selectedMode);
    const setSelectedInterface = useCanBusStore((s) => s.setSelectedInterface);
    const setSelectedMode = useCanBusStore((s) => s.setSelectedMode);
    const refreshCanStatus = useCanBusStore((s) => s.refreshStatus);
    const availableInterfaces = useMemo(() => {
        if (!canStatus) return CAN_INTERFACE_OPTIONS;

        const available = CAN_INTERFACE_OPTIONS.filter((iface) => {
            const interfaceStatus = canStatus[iface];
            return interfaceStatus?.exists || iface === selectedInterface;
        });

        return available.length ? available : CAN_INTERFACE_OPTIONS;
    }, [canStatus, selectedInterface]);

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
            {/* Header */}
            <div className="absolute top-2 flex justify-between items-start rounded-2xl border border-cyan-400/30 bg-slate-950/90 p-4 shadow-2xl shadow-cyan-500/20 left-1/2 z-20 w-[min(94vw,900px)] -translate-x-1/2">
                <div>
                    <p className="text-xs uppercase tracking-[0.4em] text-yellow-300">
                        SIGNAL RECON SETUP
                    </p>

                    <p className="text-4xl font-black text-cyan-100">
                        Select Vehicle
                    </p>
                </div>

                <div className="grid grid-cols-2 gap-2 font-mono text-xs text-slate-400 sm:flex sm:items-end sm:justify-end">
                    <label className="">
                        <span className="text-[10px] tracking-[0.24em] text-slate-500">
                            IFACE: 
                        </span>
                        <select
                            value={selectedInterface}
                            // disabled={canControlsDisabled}
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
                            // disabled={canControlsDisabled}
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
                        selected={selectedIndex === 3}
                        variant="danger"
                        onFocus={() => setActiveMenuIndex(3)}
                        onPress={() => setScreen("main")}
                    >
                        EXIT
                    </GameButton>
                </div>
            </div>

            {/* Selection Components */}
            <div className="absolute bottom-2 left-1/2 z-20 w-[min(94vw,900px)] -translate-x-1/2">

                {/* Vehicle */}
                <div className={`px-4 mb-2 rounded-2xl border  ${selectedIndex === 0
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
                <div className="grid grid-cols-2 gap-3">
                    <GameButton
                        selected={selectedIndex === 2}
                        disabled={!canStartSignalRecon}
                        onFocus={() => setActiveMenuIndex(2)}
                        onPress={startSignalRecon}
                    >
                        START
                    </GameButton>

                    <GameButton
                        selected={selectedIndex === 3}
                        variant="danger"
                        onFocus={() => setActiveMenuIndex(3)}
                        onPress={() => setScreen("main")}
                    >
                        EXIT
                    </GameButton>
                </div>
            </div>
        </div>
    );
}