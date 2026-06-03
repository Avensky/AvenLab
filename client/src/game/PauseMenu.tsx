import { useUIStore } from "../store";
import { GameButton } from "../components/GameButton";

export function PauseMenu() {

  const selectedIndex = useUIStore((s) => s.selectedMenuIndexById.pause);
  const setActiveMenuIndex = useUIStore((s) => s.setActiveMenuIndex);
  const activateActiveMenuSelection = useUIStore((s) => s.activateActiveMenuSelection);

  return (
    <div className="game-ui flex h-full w-full items-center justify-center bg-black/65 p-4 backdrop-blur-sm">
      <div className="w-[min(92vw,520px)] rounded-2xl border border-cyan-400/30 bg-slate-950/95 p-6 shadow-2xl shadow-cyan-500/20">
        <p className="text-xs uppercase tracking-[0.4em] text-yellow-300">
          REDLINE VECTOR
        </p>

        <h2 className="mt-2 text-3xl font-black text-cyan-100">
          PAUSED
        </h2>

        <div className="mt-6 grid gap-3">
          <GameButton
            selected={selectedIndex === 0}
            onFocus={() => setActiveMenuIndex(0)}
            onPress={activateActiveMenuSelection}
          >
            RESUME
          </GameButton>

          <GameButton
            selected={selectedIndex === 1}
            onFocus={() => setActiveMenuIndex(1)}
            onPress={activateActiveMenuSelection}
          >
            DEBUGGER
          </GameButton>

          <GameButton
          selected={selectedIndex === 2}
            onFocus={() => setActiveMenuIndex(1)}
            onPress={activateActiveMenuSelection}
          >
            SETTINGS
          </GameButton>

          <GameButton
            selected={selectedIndex === 3}
            variant="danger"
            onFocus={() => setActiveMenuIndex(2)}
            onPress={activateActiveMenuSelection}
          >
            RETURN TO MAIN MENU          
          </GameButton>
        </div>
      </div>
    </div>
  );
}