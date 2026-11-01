import { SettingsMenu } from "../src/game/menus/SettingsMenu";
import { SocialPanel } from "../src/game/social/SocialPanel";
import { SignalRecon } from "../src/game/modes/recon/SignalRecon";
/** Real alpha socket and UI without loading the 3D garage. Browser regression
 * surface only; gameplay uses the normal App/FullCanvas entry point. */
import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { MainMenu } from "../src/game/menus/MainMenu";
import { SignalReconSetup } from "../src/game/modes/recon/SignalReconSetup";
import { HeroSelection } from "../src/game/alpha/HeroSelection";
import { ModeSelection } from "../src/game/alpha/ModeSelection";
import { QueueScreen } from "../src/game/alpha/QueueScreen";
import { CareerMenu } from "../src/game/menus/CareerMenu";
import { WorldBuilderPanel } from "../src/worldBuilder/panels/WorldBuilderPanel";
import { DrivingHUD } from "../src/ui/DrivingHUD";
import { Keyboard } from "../src/controls/Keyboard";
import { GameController } from "../src/controls/GameController";
import { OnScreenKeyboard } from "../src/components/text/OnScreenKeyboard";
import { useUIStore } from "../src/store/menus/uiStore";
import { useAppTheme } from "../src/theme";
import { useAlphaFlow } from "../src/game/alpha/useAlphaFlow";
import { connectRustServer, disconnectRustServer } from "../src/net/rustSocket";
import "../src/index.css";
import "../src/theme/theme.css";
import "../src/components/menus/menus.css";
import "../src/ui/drivingHud.css";
export function AlphaPreview() {
  const [collapsed, setCollapsed] = useState(false),
    [sidebarHidden, setSidebarHidden] = useState(false);
  useAppTheme();
  useAlphaFlow();
  const screen = useUIStore((s) => s.screen),
    overlay = useUIStore((s) => s.overlay);
  useEffect(() => {
    connectRustServer();
    return disconnectRustServer;
  }, []);
  return (
    <>
      <div
        style={{
          position: "fixed",
          inset: 0,
          background: "radial-gradient(ellipse at 55% 42%,#18354b,#030914 70%)",
        }}
      />
      {screen === "main" ? (
        <MainMenu />
      ) : screen === "queue" ? (
        <QueueScreen />
      ) : screen === "settings" ? (
        <SettingsMenu />
      ) : screen === "social" ? (
        <SocialPanel />
      ) : screen === "signal_recon" ? (
        <SignalRecon
          collapsed={collapsed}
          setCollapsed={setCollapsed}
          sidebarHidden={sidebarHidden}
          setSidebarHidden={setSidebarHidden}
        />
      ) : screen === "mode_select" ? (
        <ModeSelection />
      ) : screen === "hero_select" ? (
        <HeroSelection />
      ) : screen === "signal_recon_setup" ? (
        <SignalReconSetup collapsed={false} setCollapsed={() => {}} />
      ) : screen === "career" ? (
        <CareerMenu />
      ) : (
        <>
          <DrivingHUD />
          <button
            type="button"
            style={{ position: "fixed", top: "48%", left: 10, zIndex: 90 }}
            onClick={() => useUIStore.getState().setScreen("hero_select")}
          >
            BACK TO HEROES
          </button>
          {overlay === "world_builder" && <WorldBuilderPanel />}
        </>
      )}
      <Keyboard />
      <GameController />
      <OnScreenKeyboard />
    </>
  );
}
createRoot(document.getElementById("root")!).render(<AlphaPreview />);
