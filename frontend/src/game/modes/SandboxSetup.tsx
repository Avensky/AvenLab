import { useGameStore, useSelectionStore, useUIStore } from "../../store";
import { useRenderSettingsStore } from "../../store/renderSettingsStore";
import { GameButton } from "../../components/GameButton";
import { socket } from "../../net/rustSocket";
import { useNetworkStore } from "../../store/networkStore";
import { useCallback, useEffect, useRef, useState } from "react";
import SignalReconHeader from "./SignalReconHeader";
import { MapSelector } from "./MapSelector";
import { VehicleSelector } from "./VehicleSelector";

type Sandbox = {
  collapsed: boolean; 
  setCollapsed: (collapsed: boolean)=>void;
}

export function SandboxSetup({collapsed, setCollapsed}: Sandbox) {
    const connected = useNetworkStore((s) => s.connected);
    const [spawnError, setSpawnError] = useState("");
    const setScreen = useUIStore((s) => s.setScreen);

    const vehicle = useSelectionStore((s) => s.getSelectedVehicle());
    const map = useSelectionStore((s) => s.getSelectedMap());
    const setActiveMenuIndex = useUIStore((s) => s.setActiveMenuIndex);
    const selectedIndex = useUIStore((s) => s.selectedMenuIndexById.sandbox_setup);
    const choices = useRef<HTMLDivElement>(null);

    const startSandbox = useCallback(() => {
        if (!connected || !socket || socket.readyState !== WebSocket.OPEN) {
            setSpawnError("Connecting to the game server. Try again when connected.");
            return;
        }
        setSpawnError("");
        useRenderSettingsStore.getState().startSandbox();

        socket?.send?.(
            JSON.stringify({
                type: "spawn_request",
                vehicle: vehicle.id,
                map: map.id,
                mode: "sandbox",
            })
        );

        setScreen("sandbox");
        useGameStore.setState({
            camera: "DEFAULT",
        });
    }, [
        connected,
        map.id,
        setScreen,
        vehicle.id,
    ]);

    const exitSandboxSetup = useCallback(() => {
        setScreen("main");
    }, [setScreen]);


    useEffect(() => {
        setActiveMenuIndex(0);
    }, [setActiveMenuIndex]);

    useEffect(() => {
        const element = choices.current?.querySelector<HTMLElement>(`[data-sandbox-choice="${selectedIndex}"]`);
        element?.focus({ preventScroll: true });
        element?.scrollIntoView({ block: "nearest" });
    }, [selectedIndex]);

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
                className="garage-selection-header"
                collapsed={collapsed}
                setCollapsed={setCollapsed}
                exitLabel="BACK"
                exitVariant="neutral"
                showCanControls={false}
                showStatus={false}
                exitDisabled={false}
                onExit={() => setScreen("main")}
            />
            {/* Selection Components */}
            <div ref={choices} className="garage-selection-controls absolute bottom-0 left-1/2 z-20 max-h-[65svh] w-full -translate-x-1/2 overflow-y-auto">

                {(!connected || spawnError) && <p role="status" className="garage-selection-status px-4 py-2 text-center text-sm text-amber-200">{spawnError || "Connecting to the game server…"}</p>}
                <div data-sandbox-choice={0} tabIndex={0} role="group" aria-label="Vehicle selection" className="outline-none"
                    onFocus={() => setActiveMenuIndex(0)}>
                    <VehicleSelector
                        menuId="sandbox_setup"
                        menuIndex={0}
                        showCanSlug={false}
                        showNotes={false}
                        translucent
                    />
                </div>
                <div data-sandbox-choice={1} tabIndex={0} role="group" aria-label="Environment selection" className="outline-none"
                    onFocus={() => setActiveMenuIndex(1)}>
                    <MapSelector menuId="sandbox_setup" menuIndex={1} translucent />
                </div>

                <div className="relative grid grid-cols-2 border border-cyan-400/30">
                    <GameButton
                        data-sandbox-choice={2}
                        variant="neutral"
                        selected={selectedIndex === 2}
                        aria-disabled={!connected}
                        onFocus={() => setActiveMenuIndex(2)}
                        onPress={startSandbox}
                        className={`flex justify-center border-0 ${connected ? "" : "opacity-50"}`}
                    >
                        A&nbsp;&nbsp;START
                    </GameButton>

                    <GameButton
                        data-sandbox-choice={3}
                        variant="neutral"
                        selected={selectedIndex === 3}
                        onFocus={() => setActiveMenuIndex(3)}
                        onPress={exitSandboxSetup}
                        className="flex justify-center border-0"
                    >
                        B&nbsp;&nbsp;EXIT
                    </GameButton>
                    <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-1/2 z-10 border-l border-cyan-300/60" />
                </div>
            </div>
        </div>
    );
}
