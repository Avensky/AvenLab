import { FullCanvas } from "../FullCanvas";
import { useUIStore } from "../store";
import { VehiclePreview } from "./preview";
import { MainMenu, ModeLoadingScreen, PauseMenu } from "./index";
import { Sandbox, SandboxSetup, SignalRecon, SignalReconMission, Swarm } from "./modes";
import { DebugMenu } from "../components/debugger/DebugMenu";
import { ControlsPanel, Pedals, Steering } from "../ui";
import { CommandLine } from "../ui/command/CommandLine";

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

    {/* UI Overlay */}
    {screen === "sandbox" && <ControlsPanel />}
    {screen === "sandbox" && <Steering />}
    {screen === "sandbox" && <Pedals />}

    {/* Game Screens */}
    {screen === "signal_recon" && <SignalRecon />}
    {screen === "signal_recon_mission" && <SignalReconMission />}
    {screen === "sandbox_setup" && <SandboxSetup />}

    {/* Menus */}
    {screen === "main" && <MainMenu />}
    {overlay === "pause" && <PauseMenu />}
    {overlay === "debug_menu" && <DebugMenu />}

    <CommandLine />
    <ModeLoadingScreen />
  </div>
}