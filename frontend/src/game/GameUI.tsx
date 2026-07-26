import { FullCanvas } from "../FullCanvas";
import { useUIStore } from "../store";
import { VehiclePreview } from "./preview";
import { MainMenu, ModeLoadingScreen, PauseMenu } from "./index";
import { Sandbox, SandboxSetup, SignalRecon, SignalReconSetup, SignalReconMission, Swarm } from "./modes";
import { DebugMenu } from "../components/debugger/DebugMenu";
import { ControlsPanel, Pedals, Steering } from "../ui";
import { CommandLine } from "../ui/command/CommandLine";
import { useState } from "react";

export function GameUI() {
  const screen = useUIStore((s) => s.screen);
  const overlay = useUIStore((s) => s.overlay);
  const [collapsed, setCollapsed] = useState(false);
  const [reconSidebarHidden, setReconSidebarHidden] = useState(false);


  return <div className="relative game-wrapper">
    {/* Requires Canvas */}
    <FullCanvas>
      {screen === "sandbox_setup" && <VehiclePreview />}
      {screen === "sandbox" && <Sandbox />}

      {screen === "swarm" && <Swarm />}
      {screen === "signal_recon_setup" && <VehiclePreview />}
      {/* {!needsCanvas && screen === "settings" && <Settings />} */}
    </FullCanvas>

    {/* UI Overlay */}
    {screen === "sandbox" && <ControlsPanel />}
    {screen === "sandbox" && <Steering />}
    {screen === "sandbox" && <Pedals />}

    {/* Game Screens */}
    {screen === "signal_recon" && (
      <SignalRecon
        collapsed={collapsed}
        setCollapsed={setCollapsed}
        sidebarHidden={reconSidebarHidden}
        setSidebarHidden={setReconSidebarHidden}
      />
    )}
    {screen === "signal_recon_mission" && <SignalReconMission collapsed={collapsed} setCollapsed={setCollapsed}/>}
    {screen === "sandbox_setup" && <SandboxSetup />}
    {screen === "signal_recon_setup" && <SignalReconSetup collapsed={collapsed} setCollapsed={setCollapsed}/>}
    {/* Menus */}
    {screen === "main" && <MainMenu />}
    {overlay === "pause" && <PauseMenu />}
    {overlay === "debug_menu" && <DebugMenu />}

    <CommandLine />
    <ModeLoadingScreen />
  </div>
}