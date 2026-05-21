import { useUIStore } from "../store";
import { GameButton } from "../components/GameButton";
import { useEffect, useRef } from "react";

const menuItems = [
  {
    label: "START SANDBOX",
    desc: "Load Blue Team base, city chunk, vehicle controls, and physics.",
    screen: "sandbox" as const,
    variant: "primary" as const,
  },
  {
    label: "SIGNAL RECON MODE",
    desc: "Baseline, action, validation, record, replay.",
    screen: "signal_recon" as const,
    variant: "warning" as const,
  },
  {
    label: "SWARM COMMAND",
    desc: "Multi-domain vehicle orchestration.",
    screen: "swarm" as const,
    variant: "danger" as const,
  },
  {
    label: "SETTINGS",
    desc: "Controls, mobile layout, audio, HUD, and display.",
    screen: "settings" as const,
    variant: "secondary" as const,
  },
];

export function MainMenu() {
  const selectedIndex = useUIStore((s) => s.selectedMenuIndexById.main);
  const setActiveMenuIndex = useUIStore((s) => s.setActiveMenuIndex);
  const startModeLoading = useUIStore((s) => s.startModeLoading);

  const itemRefs = useRef<Array<HTMLDivElement | null>>([]);

  useEffect(() => {
    const el = itemRefs.current[selectedIndex];
    if (!el) return;

    el.scrollIntoView({
      block: "nearest",
      inline: "nearest",
      behavior: "smooth",
    });
  }, [selectedIndex]);

  return (
    <div className="game-ui h-screen w-screen bg-[#020617] text-cyan-100">
      <div className="relative mx-auto flex min-h-screen w-[min(92vw,760px)] items-center py-8">
        <div className="w-full rounded-2xl border border-cyan-400/30 bg-slate-950/85 p-8 shadow-2xl shadow-cyan-500/20 backdrop-blur">
          <div className="mb-6 border-b border-cyan-400/20 pb-4">
            <div className="flex flex-col items-center gap-4 text-center sm:flex-row sm:text-left">
              <img
                src="/images/logo.png"
                alt="logo"
                className="h-20 w-20 shrink-0 select-none object-contain drop-shadow-[0_0_22px_rgba(34,211,238,0.35)] sm:h-24 sm:w-24"
                draggable={false}
              />

              <div className="min-w-0">
                <p className="text-xs uppercase tracking-[0.3em] text-yellow-300 sm:tracking-[0.45em]">
                  AVENLAB // CYBER S&amp;T DIVISION
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

          <div className="grid gap-3">
            {menuItems.map((item, index) => (
              <GameButton
                key={item.screen}
                ref={(el) => {
                  itemRefs.current[index] = el;
                }}
                selected={selectedIndex === index}
                variant={item.variant}
                onPress={() => startModeLoading(item.screen, `Loading ${item.label}`)}
                onFocus={() => setActiveMenuIndex(index)}
              >
                {item.label}
                <span className="block text-xs font-normal text-slate-400">
                  {item.desc}
                </span>
              </GameButton>
            ))}
          </div>

          <div className="mt-6 flex items-center justify-between border-t border-cyan-400/20 pt-4 text-xs text-slate-500">
            <span>&gt; D-PAD / LEFT STICK TO NAVIGATE</span>
            <span className="text-red-300">A / ENTER TO SELECT</span>
          </div>
        </div>
      </div>
    </div>
  );
}