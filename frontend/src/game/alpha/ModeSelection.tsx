import { useCallback, useEffect, useRef, useState } from "react";
import { ControllerButton, MenuShortcuts } from "../../components/controller";
import {
  GAME_MODES,
  useAlphaStore,
  showFavoriteHero,
} from "../../store/alpha/alphaStore";
import { useUIStore } from "../../store/menus/uiStore";
import { useNetworkStore } from "../../store/session/networkStore";
import { useCanBusStore } from "../../store/recon/canBusStore";
import { captureReady } from "../../store/recon/captureSetup";
import { CanCaptureSelectors } from "../modes/recon/CanCaptureSelectors";
import { MapSelector } from "../modes/MapSelector";
import { useFormNavigation } from "../social/useFormNavigation";
import { joinSelectedMode } from "./sessionActions";
import { ProgressBadge } from "./ProgressBadge";
import { LobbyChat } from "./LobbyChat";
import "./heroSelection.css";

/** Mode configuration never selects a hero. A real seat assignment opens the
 * next stage; matchmaking and the portrait picker cannot race each other. */
export function ModeSelection() {
  const mode = useAlphaStore((s) => s.mode);
  const connected = useNetworkStore((s) => s.connected);
  const root = useRef<HTMLElement>(null),
    pending = useRef(false);
  const [busy, setBusy] = useState(false),
    [status, setStatus] = useState("");
  const research = mode === "signal_recon",
    planned = mode === "swarm";
  const item = GAME_MODES.find((m) => m.id === mode)!;
  const back = useCallback(() => {
    if (!pending.current) useUIStore.getState().setScreen("main");
  }, []);
  const tab = useCallback((direction: number) => {
    if (pending.current) return;
    const current = useAlphaStore.getState().mode;
    useAlphaStore
      .getState()
      .chooseMode(
        GAME_MODES[
          (GAME_MODES.findIndex((m) => m.id === current) +
            direction +
            GAME_MODES.length) %
            GAME_MODES.length
        ].id,
      );
    setStatus("");
  }, []);
  useFormNavigation(root, back, tab, true);
  useEffect(() => {
    showFavoriteHero();
  }, []);
  useEffect(() => {
    if (research) void useCanBusStore.getState().refreshStatus();
  }, [research]);
  useEffect(() => {
    // Directional navigation starts with configuration, not the mode tab rail.
    // Shoulders/Q/E/Tab select a mode immediately without an extra A press.
    if (!root.current?.contains(document.activeElement))
      root.current
        ?.querySelector<HTMLElement>(
          "[data-mode-config] [data-controller-selector], [data-mode-config] button, .alpha-deploy:not(:disabled)",
        )
        ?.focus({ preventScroll: true });
  }, [mode]);
  const next = async () => {
    if (pending.current || planned) return;
    pending.current = true;
    setBusy(true);
    setStatus("");
    try {
      if (research) {
        const can = useCanBusStore.getState();
        if (!captureReady(can.selectedInterface, can.selectedMode, can.status))
          throw Error(
            `${can.selectedInterface} is unavailable or down. Choose an active interface or Simulation.`,
          );
        useAlphaStore.getState().clearHero();
        useUIStore.getState().setScreen("hero_select");
      } else {
        useAlphaStore.getState().clearHero();
        await joinSelectedMode();
      }
    } catch (error) {
      setStatus((error as Error).message);
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  return (
    <section
      ref={root}
      className="game-ui menu-surface alpha-selection hero-selection mode-selection"
      data-controller-form
      data-controller-rows
      aria-label="Game mode selection"
    >
      <header className="alpha-header">
        <div>
          <small>REDLINE VECTOR · ALPHA</small>
          <h1>PLAY</h1>
        </div>
        <ProgressBadge />
        <button
          type="button"
          className="menu-control controller-action"
          disabled={busy}
          onClick={back}
        >
          <ControllerButton button="B" /> BACK
        </button>
      </header>
      <nav
        className="alpha-mode-tabs"
        role="tablist"
        aria-label="Game mode"
        data-controller-tab-only
      >
        {GAME_MODES.map((entry) => (
          <button
            key={entry.id}
            type="button"
            role="tab"
            className="menu-control"
            aria-selected={mode === entry.id}
            tabIndex={mode === entry.id ? 0 : -1}
            disabled={busy}
            onFocus={() => {
              useAlphaStore.getState().chooseMode(entry.id);
              setStatus("");
            }}
            onClick={() => {
              useAlphaStore.getState().chooseMode(entry.id);
              setStatus("");
            }}
          >
            {entry.label}
            {entry.id === "swarm" && (
              <small className="alpha-mode-planned">PLANNED</small>
            )}
          </button>
        ))}
      </nav>
      <div className="hero-selection-stage">
        <section className="hero-summary" aria-label="Selected game mode">
          <small>GAME MODE</small>
          <h2>{item.label}</h2>
          {status && (
            <p className="alpha-status" role="status">
              {status}
            </p>
          )}
        </section>
        <div className="hero-chat-panel">
          <LobbyChat />
        </div>
      </div>
      {(mode === "sandbox" || mode === "editor" || research) && (
        <div className="mode-config-bar" data-mode-config data-controller-row>
          {research ? (
            <CanCaptureSelectors
              formNavigation
              disabled={busy}
              onChange={() => setStatus("")}
            />
          ) : (
            <MapSelector
              formNavigation
              translucent
              showDesc={false}
              disabled={busy}
              onConfirm={() => void next()}
            />
          )}
        </div>
      )}
      <footer className="alpha-selection-footer" data-controller-row>
        <MenuShortcuts chat directions="both" tabKey />
        <button
          type="button"
          className="menu-control controller-action alpha-deploy"
          disabled={busy || planned || (!research && !connected)}
          onClick={() => void next()}
        >
          <ControllerButton button="A" />
          {busy ? "FINDING SERVER…" : planned ? "COMING LATER" : "CONTINUE"}
        </button>
      </footer>
    </section>
  );
}
