// src/components/debugger/DebugMenu.tsx
import { useCallback, useEffect, useState } from "react";

import { GameButton } from "../GameButton";
import { useUIStore, useWorldStore } from "../../store";
import { useDebugViewStore } from "../../store/debugViewStore";
import { DebugFlags, hasDebugFlag } from "../../store/tools/debugMasks";

const VIEW_MODES = ["glb", "geometry", "collider", "hybrid"] as const;

const DEBUG_OPTIONS = [
  ["Chassis", DebugFlags.CHASSIS],
  ["Wheels", DebugFlags.WHEELS],
  ["Suspension Rays", DebugFlags.RAYS],
  ["Slip Vectors", DebugFlags.SLIP],
  ["Load Bars", DebugFlags.LOAD_BARS],
  ["Anti-Roll Bars", DebugFlags.ARB],
  ["Block Colliders", DebugFlags.BLOCKS],
] as const;

const ALL_DEBUG = DEBUG_OPTIONS.reduce((mask, [, flag]) => mask | flag, 0);

const SCOPE_ROW = 0;
const MODE_ROW = 1;
const MASTER_DEBUG_ROW = 2;
const FIRST_FLAG_ROW = 3;
const BACK_ROW = FIRST_FLAG_ROW + DEBUG_OPTIONS.length;
const ROW_COUNT = BACK_ROW + 1;

export function DebugMenu() {
  const mode = useWorldStore((state) => state.mode);
  const setMode = useWorldStore((state) => state.setMode);
  const debugMask = useWorldStore((state) => state.debugMask);
  const setDebugMask = useWorldStore((state) => state.setDebugMask);
  const toggleDebugFlag = useWorldStore((state) => state.toggleDebugFlag);

  const playerScope = useDebugViewStore((state) => state.playerScope);
  const setPlayerScope = useDebugViewStore((state) => state.setPlayerScope);
  const togglePlayerScope = useDebugViewStore((state) => state.togglePlayerScope);

  const [selectedRow, setSelectedRow] = useState(0);
  const allDebugEnabled = (debugMask & ALL_DEBUG) === ALL_DEBUG;

  const returnToPause = useCallback(() => {
    useUIStore.setState({ overlay: "pause" });
  }, []);

  const moveSelection = useCallback((direction: -1 | 1) => {
    setSelectedRow((current) => (current + direction + ROW_COUNT) % ROW_COUNT);
  }, []);

  const cycleMode = useCallback((direction: -1 | 1) => {
    const current = VIEW_MODES.indexOf(mode);
    const next = (current + direction + VIEW_MODES.length) % VIEW_MODES.length;
    setMode(VIEW_MODES[next]);
  }, [mode, setMode]);

  const adjustSelectedRow = useCallback((direction: -1 | 1) => {
    if (selectedRow === SCOPE_ROW) {
      setPlayerScope(direction < 0 ? "local" : "all");
    } else if (selectedRow === MODE_ROW) {
      cycleMode(direction);
    } else if (selectedRow === MASTER_DEBUG_ROW) {
      setDebugMask(direction < 0 ? 0 : ALL_DEBUG);
    }
  }, [cycleMode, selectedRow, setDebugMask, setPlayerScope]);

  const activateSelectedRow = useCallback(() => {
    if (selectedRow === SCOPE_ROW) togglePlayerScope();
    else if (selectedRow === MODE_ROW) cycleMode(1);
    else if (selectedRow === MASTER_DEBUG_ROW) {
      setDebugMask(allDebugEnabled ? 0 : ALL_DEBUG);
    }
    else if (selectedRow === BACK_ROW) returnToPause();
    else {
      const option = DEBUG_OPTIONS[selectedRow - FIRST_FLAG_ROW];
      if (option) toggleDebugFlag(option[1]);
    }
  }, [allDebugEnabled, cycleMode, returnToPause, selectedRow, setDebugMask, toggleDebugFlag, togglePlayerScope]);

  useEffect(() => {
    const handlers = {
      up: () => moveSelection(-1),
      down: () => moveSelection(1),
      left: () => adjustSelectedRow(-1),
      right: () => adjustSelectedRow(1),
      activate: () => activateSelectedRow(),
      back: () => returnToPause(),
    };
    const eventNames = {
      up: "avenlab:debug-menu-up",
      down: "avenlab:debug-menu-down",
      left: "avenlab:debug-menu-left",
      right: "avenlab:debug-menu-right",
      activate: "avenlab:debug-menu-activate",
      back: "avenlab:debug-menu-back",
    } as const;

    Object.entries(eventNames).forEach(([key, name]) => {
      window.addEventListener(name, handlers[key as keyof typeof handlers]);
    });

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowUp") handlers.up();
      else if (event.key === "ArrowDown") handlers.down();
      else if (event.key === "ArrowLeft") handlers.left();
      else if (event.key === "ArrowRight") handlers.right();
      else if (event.key === "Enter" || event.key === " ") handlers.activate();
      else if (event.key === "Escape") handlers.back();
      else return;
      event.preventDefault();
    };
    window.addEventListener("keydown", onKeyDown);

    return () => {
      Object.entries(eventNames).forEach(([key, name]) => {
        window.removeEventListener(name, handlers[key as keyof typeof handlers]);
      });
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [activateSelectedRow, adjustSelectedRow, moveSelection, returnToPause]);

  return (
    <div className="game-ui fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-md">
      <section className="flex max-h-[92vh] w-[min(94vw,900px)] flex-col overflow-hidden rounded-2xl border border-cyan-300/35 bg-slate-950/95 shadow-2xl shadow-cyan-500/20">
        <header className="border-b border-cyan-400/20 px-6 py-5">
          <p className="text-xs uppercase tracking-[0.4em] text-yellow-300">
            REDLINE VECTOR // IN-GAME MENU
          </p>
          <h2 className="mt-2 text-3xl font-black text-cyan-100">DEBUGGER</h2>
          <p className="mt-1 text-sm text-slate-400">
            D-pad or stick to navigate · A to change · B to return
          </p>
        </header>

        <div className="grid min-h-0 flex-1 gap-3 overflow-y-auto p-6 md:grid-cols-2">
          <GameButton selected={selectedRow === SCOPE_ROW} onFocus={() => setSelectedRow(SCOPE_ROW)} onPress={togglePlayerScope}>
            PLAYER VIEW: {playerScope === "all" ? "ALL PLAYERS" : "MY VEHICLE"}
          </GameButton>
          <GameButton selected={selectedRow === MODE_ROW} onFocus={() => setSelectedRow(MODE_ROW)} onPress={() => cycleMode(1)}>
            VIEW MODE: {mode.toUpperCase()}
          </GameButton>
          <GameButton
            selected={selectedRow === MASTER_DEBUG_ROW}
            onFocus={() => setSelectedRow(MASTER_DEBUG_ROW)}
            onPress={() => setDebugMask(allDebugEnabled ? 0 : ALL_DEBUG)}
            className="md:col-span-2"
            aria-pressed={allDebugEnabled}
          >
            ALL DEBUG: {allDebugEnabled ? "ON" : "OFF"}
          </GameButton>

          {DEBUG_OPTIONS.map(([label, flag], index) => {
            const row = FIRST_FLAG_ROW + index;
            return (
              <GameButton key={label} selected={selectedRow === row} onFocus={() => setSelectedRow(row)} onPress={() => toggleDebugFlag(flag)}>
                {label.toUpperCase()}: {hasDebugFlag(debugMask, flag) ? "ON" : "OFF"}
              </GameButton>
            );
          })}

          <GameButton selected={selectedRow === BACK_ROW} variant="danger" onFocus={() => setSelectedRow(BACK_ROW)} onPress={returnToPause} className="md:col-span-2">
            BACK TO PAUSE MENU
          </GameButton>
        </div>

        <footer className="border-t border-cyan-400/15 px-6 py-3 font-mono text-xs text-slate-500">
          mask: {debugMask} · scope: {playerScope}
        </footer>
      </section>
    </div>
  );
}
