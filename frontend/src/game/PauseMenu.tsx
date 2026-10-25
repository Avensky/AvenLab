import { trapMenuFocus } from "../components/menus/menuFocus";
import { useEffect, useRef } from "react";
import { useUIStore } from "../store/uiStore";
import { GameButton } from "../components/GameButton";
import { PAUSE_MENU_ITEMS } from "./menuItems";

export function PauseMenu() {
  const selectedIndex = useUIStore((s) => s.selectedMenuIndexById.pause);
  const setIndex = useUIStore((s) => s.setActiveMenuIndex);
  const buttons = useRef<Array<HTMLDivElement | null>>([]);
  useEffect(() => {
    const element = buttons.current[selectedIndex];
    element?.focus({ preventScroll: true });
    element?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);
  const activate = useUIStore((s) => s.activateActiveMenuSelection);
  return <div className="game-ui menu-surface fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4 text-slate-100 backdrop-blur-md">
    <section onKeyDown={trapMenuFocus} role="dialog" aria-modal="true" aria-labelledby="pause-title" className="menu-shell max-h-[94svh] w-full max-w-xl overflow-y-auto rounded-2xl border border-cyan-300/25 bg-slate-950 p-6 shadow-2xl sm:p-8">
      <p className="text-xs font-bold tracking-[0.3em] text-cyan-300">REDLINE VECTOR / FIELD MENU</p>
      <h1 id="pause-title" className="mt-3 text-4xl font-black">Take a breath.</h1>
      <p className="mt-2 text-sm text-slate-400">Driving input is suspended. The online world keeps running.</p>
      <div className="mt-6 grid gap-2">
        {PAUSE_MENU_ITEMS.map((item, index) => <GameButton key={item.id} ref={(element) => { buttons.current[index] = element; }} selected={selectedIndex === index}
          variant={item.id === "leave_game" ? "danger" : "secondary"} onFocus={() => setIndex(index)}
          onPress={() => { setIndex(index); activate(); }} className="menu-row rounded-xl px-4 py-3">
          <span className="block text-sm">{item.label}</span><span className="mt-1 block text-xs font-normal text-slate-400">{item.description}</span>
        </GameButton>)}
      </div>
      <p className="mt-5 text-xs text-slate-500">D-pad / arrows Navigate · A / Enter Select · B / Esc Resume</p>
    </section>
  </div>;
}
