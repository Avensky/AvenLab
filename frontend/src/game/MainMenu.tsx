import { useUIStore } from "../store";
import { GameButton } from "../components/GameButton";
import { useEffect, useRef } from "react";

import { MAIN_MENU_ITEMS } from "./menuItems";

export function MainMenu() {
  const selectedIndex = useUIStore((s) => s.selectedMenuIndexById.main);
  const setActiveMenuIndex = useUIStore((s) => s.setActiveMenuIndex);
  const activate = useUIStore((s) => s.activateActiveMenuSelection);

  const itemRefs = useRef<Array<HTMLDivElement | null>>([]);

  useEffect(() => {
    const el = itemRefs.current[selectedIndex];
    if (!el) return;

    el.focus({ preventScroll: true });
    el.scrollIntoView({
      block: "nearest",
      inline: "nearest",
      behavior: "auto",
    });
  }, [selectedIndex]);

  return (
    <div className="game-ui menu-surface main-menu relative z-30 px-2 h-full items-center flex flex-col justify-start py-5 sm:justify-center bg-slate-950/85 shadow-2xl shadow-cyan-500/20 backdrop-blur">
      <div className="shrink-0 border-b border-cyan-400/20 p-2">
        <div className="flex flex-col items-center gap-4 text-center sm:flex-row sm:text-left">
          <img
            src="/images/logo.png"
            alt="logo"
            className="h-20 w-20 shrink-0 select-none object-contain drop-shadow-[0_0_22px_rgba(34,211,238,0.35)] sm:h-24 sm:w-24"
            draggable={false}
          />

          <div className="min-w-0">
            <p className="text-xs uppercase tracking-[0.3em] text-yellow-300 sm:tracking-[0.45em]">
              CYBERSECURITY SCIENCE &amp; TECHNOLOGY
            </p>

            <h1 className="mt-3 text-4xl font-black tracking-tight text-cyan-100 sm:text-5xl">
              REDLINE VECTOR
            </h1>

            <p className="mt-2 text-sm text-slate-400">
              Land. Air. Sea. Signal.
            </p>
          </div>
        </div>
      </div>

      <div className="mt-2 grid shrink-0 gap-2">
        {MAIN_MENU_ITEMS.map((item, index) => (
          <GameButton
            key={item.id}
            ref={(el) => {
              itemRefs.current[index] = el;
            }}
            selected={selectedIndex === index}
            variant="primary"
            data-selected={selectedIndex === index}
            aria-disabled={!item.available}
            onPress={() => { setActiveMenuIndex(index); activate(); }}
            onFocus={() => setActiveMenuIndex(index)}
            className="menu-row rounded-lg text-center px-2 py-1"
          >
            {item.label}
            <span className="block text-xs font-normal text-slate-400">
              {item.description}
            </span>
          </GameButton>
        ))}
      </div>

      <div className="mt-3 flex items-center justify-between border-t border-cyan-400/20 pt-2 text-xs text-slate-500">
        <span>&gt; D-PAD / EITHER STICK TO NAVIGATE</span>
        <span className="text-red-300">A / ENTER TO SELECT</span>
      </div>
    </div>
  );
}
