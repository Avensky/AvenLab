import { FullCanvas } from "../FullCanvas";
import { useUIStore } from "../store";
import { VehiclePreview } from "./preview";
import { MainMenu, ModeLoadingScreen, PauseMenu } from "./index";
import { Sandbox, SandboxSetup, SignalRecon, Swarm } from "./modes";

export function GameUI() {
  const screen = useUIStore((s) => s.screen);
  const overlay = useUIStore((s) => s.overlay);

  
  return <div className="relative h-screen w-screen overflow-hidden bg-slate-950">
    {/* Requires Canvas */}
    <FullCanvas>
      {screen === "sandbox_setup" && <VehiclePreview />}
      {screen === "sandbox" && <Sandbox />}
      {screen === "swarm" && <Swarm />}
      {/* {!needsCanvas && screen === "settings" && <Settings />} */}
    </FullCanvas>

    {/* Game Screens */}
    {screen === "signal_recon" && <SignalRecon />}
    {screen === "sandbox_setup" && <SandboxSetup />}

    {/* Menus */}
    {screen === "main" && <MainMenu />}
    {overlay === "pause" && (
      <div className="fixed inset-0 z-9999">
        <PauseMenu />
      </div>
    )}

    <ModeLoadingScreen />
  </div>
}