import { FullCanvas } from "../FullCanvas";
import { useUIStore } from "../store";
import { VehiclePreview } from "./preview";
import { MainMenu, ModeLoadingScreen, PauseMenu } from "./index";
import { Sandbox, SandboxSetup, SignalRecon, SignalReconSetup, SignalReconMission } from "./modes";
import { DebugMenu } from "../components/debugger/DebugMenu";
import { DrivingHUD } from "../ui/DrivingHUD";
import { CockpitPanel } from "../ui/Cockpit/CockpitPanel";
import { CommandLine } from "../ui/command/CommandLine";
import { lazy, Suspense, useEffect, useState } from "react";
import { SettingsMenu } from "./SettingsMenu";
import { CareerMenu } from "./CareerMenu";
import { MissionsMenu } from "./MissionsMenu";
import { SessionMenu } from "./SessionMenu";
import { VehicleMenu } from "./VehicleMenu";
import { usePreferencesStore } from "../store/preferencesStore";
import { Cameras } from "../effects";
import { PerformanceOverlay } from "../performance/PerformanceOverlay";
import { useRenderSettingsStore } from "../store/renderSettingsStore";

const WorldBuilderPanel=lazy(()=>import('../worldBuilder/WorldBuilderPanel').then(m=>({default:m.WorldBuilderPanel})));
const WorldBuilderScene=lazy(()=>import('../worldBuilder/WorldBuilderScene'));

export function GameUI() {
  const hud = useRenderSettingsStore((s) => s.hud);
  const screen = useUIStore((s) => s.screen);
  const overlay = useUIStore((s) => s.overlay);
  const needsCanvas = screen === "sandbox" || screen === "sandbox_setup" || screen === "signal_recon_setup";
  const reducedMotion = usePreferencesStore((s) => s.reducedMotion);
  const highContrast = usePreferencesStore((s) => s.highContrast);
  const textScale = usePreferencesStore((s) => s.menuTextScale);
  useEffect(() => {
    document.documentElement.dataset.reduceMotion = String(reducedMotion);
    document.documentElement.dataset.highContrast = String(highContrast);
    document.documentElement.style.setProperty("--menu-text-scale", String(textScale));
  }, [reducedMotion, highContrast, textScale]);
  const [collapsed, setCollapsed] = useState(false);
  const [reconSidebarHidden, setReconSidebarHidden] = useState(false);


  return <div className="relative game-wrapper">
    {/* Requires Canvas */}
    {needsCanvas && <FullCanvas>
      {screen === "sandbox_setup" && <VehiclePreview />}
      {screen === "sandbox" && <><group visible={overlay!=="world_builder"}><Sandbox /></group>{overlay==="world_builder"&&<Suspense fallback={null}><WorldBuilderScene/></Suspense>}</>}

      {screen === "signal_recon_setup" && <VehiclePreview />}
      {/* {!needsCanvas && screen === "settings" && <Settings />} */}
      {screen === "sandbox" && <Cameras />}
    </FullCanvas>}

    {/* UI Overlay */}
    {screen === "sandbox" && !overlay && hud && <DrivingHUD />}

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
    {screen === "sandbox_setup" && <SandboxSetup collapsed={collapsed} setCollapsed={setCollapsed} />}
    {screen === "signal_recon_setup" && <SignalReconSetup collapsed={collapsed} setCollapsed={setCollapsed}/>}
    {/* Menus */}
    {screen === "main" && <MainMenu />}
    {screen === "sandbox" && overlay === "pause" && <PauseMenu />}
    {overlay === "debug_menu" && <DebugMenu />}
    {(overlay === "settings" || (screen === "settings" && !overlay)) && <SettingsMenu />}
    {(overlay === "career" || (screen === "career" && !overlay)) && <CareerMenu />}
    {(overlay === "missions" || (screen === "missions" && !overlay)) && <MissionsMenu />}
    {overlay === "vehicle_select" && <VehicleMenu />}
    {overlay === "leave_game" && <SessionMenu />}
    {screen === "sandbox" && overlay === "cockpit" && <CockpitPanel />}
    {screen === "sandbox" && overlay === "world_builder" && <Suspense fallback={null}><WorldBuilderPanel/></Suspense>}

    {screen === "sandbox" && hud && !overlay && <CommandLine />}
    {screen === "sandbox" && <PerformanceOverlay />}
    <ModeLoadingScreen />
  </div>
}
