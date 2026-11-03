import {useSelectionStore as useWorldSelection} from '../../store/selection/selectionStore';
import {WorldPortraitCard} from '../preview/WorldPortraitCard';
import {useSocialStore} from '../../store/social/socialStore';
import { useHeroLoadouts } from "../../vehicles/cosmetics/heroLoadouts";
import { useCallback, useEffect, useRef, useState } from "react";
import { ControllerAction } from "../../components/controller";
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
import {
  cycleCanInterface,
  cycleCaptureMode,
} from "../../store/recon/captureSetup";
import { MapSelector } from "../modes/MapSelector";
import { useSelectionNavigation } from "./useSelectionNavigation";
import { useSelectionStore } from "../../store/selection/selectionStore";
import type { MenuAction } from "../../controls/inputRouting";
import { joinSelectedMode } from "./sessionActions";
import { SelectionHeader, SelectionFooter } from "./SelectionChrome";
import { LobbyChat } from "./LobbyChat";
import "./heroSelection.css";

/** Mode configuration never selects a hero. A real seat assignment opens the
 * next stage; matchmaking and the portrait picker cannot race each other. */
export function ModeSelection() {
  const recoveryNotice=useSocialStore(s=>s.recoveryMessage);
  const selectedWorld=useWorldSelection(s=>s.getSelectedMap());
  const mode = useAlphaStore((s) => s.mode);
  const defaultHero = useHeroLoadouts(s=>s.defaultHero);
  const connected = useNetworkStore((s) => s.connected);
  const root = useRef<HTMLElement>(null),
    pending = useRef(false);
  const [busy, setBusy] = useState(false),
    [status, setStatus] = useState("");
  const [canField, setCanField] = useState(0);
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
  useEffect(() => {
    showFavoriteHero();
  }, [defaultHero]);
  useEffect(() => {
    if (research) void useCanBusStore.getState().refreshStatus();
  }, [research]);
  useEffect(() => {
    root.current?.focus({ preventScroll: true });
    setCanField(0);
  }, [mode]);
  const next = useCallback(async () => {
    if (pending.current || planned) return;
    pending.current = true;
    setBusy(true);
    useSocialStore.setState({recoveryMessage:undefined});
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
  }, [research, planned]);
  const direction = useCallback(
    (action: MenuAction) => {
      if (pending.current || (action !== "left" && action !== "right")) return;
      const step = action === "left" ? -1 : 1;
      if (research)
        (canField === 0 ? cycleCanInterface : cycleCaptureMode)(step);
      else if (mode === "sandbox" || mode === "editor")
        useSelectionStore.getState()[step < 0 ? "prevMap" : "nextMap"]();
      setStatus("");
    },
    [research, canField, mode],
  );
  const option = useCallback(
    (step: number) => {
      if (research && !pending.current)
        setCanField((current) => (current + step + 2) % 2);
    },
    [research],
  );
  useEffect(() => {
    if (research)
      root.current
        ?.querySelector<HTMLElement>(`[data-can-field="${canField}"]`)
        ?.focus({ preventScroll: true });
  }, [research, canField]);
  useSelectionNavigation(root, { back, tab, direction, option, confirm: next });
  return (
    <section
      ref={root}
      className="game-ui menu-surface alpha-selection hero-selection mode-selection"
      data-controller-form
      data-controller-rows
      tabIndex={-1}
      aria-label="Game mode selection"
    >
      <SelectionHeader title="PLAY" onBack={back} busy={busy}/>
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
        {(mode==='sandbox'||mode==='editor')&&<WorldPortraitCard map={selectedWorld}/>}
        <section className="hero-summary" aria-label="Selected game mode">
          <small>GAME MODE</small>
          <h2>{item.label}</h2>
          {(status||recoveryNotice) && (
            <p className="alpha-status" role="status">
              {status||recoveryNotice}
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
              selectedIndex={canField}
              onFocus={setCanField}
              onChange={() => setStatus("")}
            />
          ) : (
            <MapSelector
              formNavigation
              translucent
              showDesc={false}
              disabled={busy}
              onConfirm={() => void next()}
              quiet
            />
          )}
        </div>
      )}
      <SelectionFooter chat secondaryTabs={research}>
        <ControllerAction button="A"
          type="button"
          className="menu-control  alpha-deploy"
          disabled={busy || planned || (!research && !connected)}
          onClick={() => void next()}
        >

          {busy ? "FINDING SERVER…" : planned ? "COMING LATER" : "CONTINUE"}
        </ControllerAction>
      </SelectionFooter>
    </section>
  );
}
