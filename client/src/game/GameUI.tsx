import { FullCanvas } from "../FullCanvas";
import { useUIStore } from "../store";
import { CityScene } from "../world";
import { MainMenu, ModeLoadingScreen, PauseMenu } from "./index";
import { Sandbox, SignalRecon, Swarm } from "./modes";

export function GameUI() {
    const screen = useUIStore((s) => s.screen);
    const overlay = useUIStore((s) => s.overlay);
    const needsCanvas =
      screen === "sandbox" ||
      screen === "swarm";

    return <div className="relative h-screen w-screen overflow-hidden bg-slate-950">
      {needsCanvas && (
        <FullCanvas>
          <CityScene />
          {screen === "sandbox" && <Sandbox />}
          {screen === "swarm" && <Swarm />}
        </FullCanvas>
      )}

      {!needsCanvas && screen === "main" && <MainMenu />}
      {!needsCanvas && screen === "signal_recon" && <SignalRecon />}
      {/* {!needsCanvas && screen === "settings" && <Settings />} */}

      {overlay === "pause" && (
        <div className="fixed inset-0 z-9999">
          <PauseMenu />
        </div>
      )}

      <ModeLoadingScreen />
    </div>
}