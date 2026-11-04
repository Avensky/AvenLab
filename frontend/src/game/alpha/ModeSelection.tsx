import {MatchModePortraits} from "./ModePortraitCard";
import {useSelectionStore as useWorldSelection} from '../../store/selection/selectionStore';
import {WorldPortraitCard} from '../preview/WorldPortraitCard';
import {createTabProfile,identifySocial} from "../../net/socialClient";
import "./profileRecovery.css";
import {useSocialStore} from '../../store/social/socialStore';
import { useHeroLoadouts } from "../../vehicles/cosmetics/heroLoadouts";
import { useCallback, useEffect, useRef, useState } from "react";
import { ControllerAction } from "../../components/controller";
import {
  GAME_MODES,
  useAlphaStore,
  showFavoriteHero,
  isMatchMode,
  canonicalGameMode,
  type MatchTeamSize,
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
  const profileId=useSocialStore(s=>s.view?.profile.id);
  const profileStatus=useSocialStore(s=>s.profileStatus);
  const profileMessage=useSocialStore(s=>s.message);
  const profileReady=Boolean(profileId)&&profileStatus!=="restoring";
  const selectedWorld=useWorldSelection(s=>s.getSelectedMap());
  const mode = useAlphaStore((s) => s.mode);
  const teamSize = useAlphaStore((s) => s.teamSize);
  const defaultHero = useHeroLoadouts(s=>s.defaultHero);
  const connected = useNetworkStore((s) => s.connected);
  const root = useRef<HTMLElement>(null),
    pending = useRef(false);
  const [busy, setBusy] = useState(false),
    [status, setStatus] = useState("");
  const [canField, setCanField] = useState(0);
  const research = mode === "signal_recon",
    planned = mode === "swarm";
  const destinations=GAME_MODES.filter(entry=>isMatchMode(entry.id)===isMatchMode(mode));
  const item = GAME_MODES.find((m) => m.id === canonicalGameMode(mode))!;
  const back = useCallback(() => {
    if (!pending.current) useUIStore.getState().setScreen("main");
  }, []);
  const tab = useCallback((direction: number) => {
    if (pending.current) return;
    const current = useAlphaStore.getState().mode;
    const entries=GAME_MODES.filter(entry=>isMatchMode(entry.id)===isMatchMode(current));
    useAlphaStore
      .getState()
      .chooseMode(
        entries[
          (entries.findIndex((m) => m.id === canonicalGameMode(current)) +
            direction +
            entries.length) %
            entries.length
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
  const selectMatchSize = useCallback((next: MatchTeamSize) => {
    if(pending.current)return;
    useAlphaStore.getState().chooseTeamSize(next);setStatus("");
  }, []);
  const next = useCallback(async () => {
    if (pending.current || planned) return;
    const focusedSize=Number((document.activeElement as HTMLElement|null)?.closest<HTMLElement>("[data-match-size]")?.dataset.matchSize);
    if(isMatchMode(useAlphaStore.getState().mode)&&(focusedSize===3||focusedSize===5)&&focusedSize!==useAlphaStore.getState().teamSize){selectMatchSize(focusedSize);return;}
    if(!research&&!profileReady){
      const active=document.activeElement as HTMLButtonElement|null;
      if(active?.matches('[data-profile-action]:not(:disabled)'))active.click();
      else root.current?.querySelector<HTMLButtonElement>('[data-profile-action]:not(:disabled)')?.focus();
      return;
    }
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
  }, [research, planned,profileReady,selectMatchSize]);
  const recoverProfile=async(tabOnly:boolean)=>{
    if(pending.current||profileStatus==="restoring")return;
    pending.current=true;setBusy(true);setStatus("");
    try {await (tabOnly?createTabProfile():identifySocial());}
    catch { /* The social client exposes the failed attempt beside these actions. */ }
    finally {pending.current=false;setBusy(false);}
  };
  const direction = useCallback(
    (action: MenuAction) => {
      if(pending.current)return;
      if(!research&&!profileReady&&connected){
        const buttons=[...root.current?.querySelectorAll<HTMLButtonElement>('[data-profile-action]:not(:disabled)')??[]];
        if(buttons.length&&["up","down","left","right"].includes(action)){
          const index=buttons.indexOf(document.activeElement as HTMLButtonElement),step=action==="up"||action==="left"?-1:1;
          buttons[index<0?0:(index+step+buttons.length)%buttons.length]?.focus();return;
        }
      }
      if(isMatchMode(mode)&&["up","down","left","right"].includes(action)){
        const cards=[...root.current?.querySelectorAll<HTMLButtonElement>('[data-match-size]:not(:disabled)')??[]];
        const index=cards.indexOf(document.activeElement as HTMLButtonElement),step=action==="up"||action==="left"?-1:1;
        cards[index<0?Math.max(0,cards.findIndex(card=>Number(card.dataset.matchSize)===useAlphaStore.getState().teamSize)):(index+step+cards.length)%cards.length]?.focus({preventScroll:true});return;
      }
      if(action!=="left"&&action!=="right")return;
      const step = action === "left" ? -1 : 1;
      if (research)
        (canField === 0 ? cycleCanInterface : cycleCaptureMode)(step);
      else if (mode === "sandbox" || mode === "editor")
        useSelectionStore.getState()[step < 0 ? "prevMap" : "nextMap"]();
      setStatus("");
    },
    [research, canField, mode,profileReady,connected],
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
      data-play-category={isMatchMode(mode)?'match':'tools'}
      data-controller-form
      data-controller-rows
      tabIndex={-1}
      aria-label="Game mode selection"
    >
      <SelectionHeader title={isMatchMode(mode)?'PLAY':'EXPLORE & BUILD'} onBack={back} busy={busy}/>
      <nav
        className="alpha-mode-tabs"
        role="tablist"
        aria-label="Game mode"
        data-controller-tab-only
      >
        {destinations.map((entry) => (
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
        {isMatchMode(mode)&&<MatchModePortraits selected={teamSize} disabled={busy} onSelect={selectMatchSize}/>}
        <section className="hero-summary" aria-label="Selected game mode">
          <small>GAME MODE</small>
          <h2>{item.label}</h2>
          {isMatchMode(mode)&&<p className="alpha-status" role="note">{teamSize===3?'3 VS 3 · One Tank, DPS and Support per team. ':'5 VS 5 · '}First to 3 captures · 15 minutes. Career records are live; {mode==='competitive'?'ranked MMR is pending.':'choose a match size to find a game.'}</p>}
          {!research&&!planned&&!profileReady&&<div className="profile-recovery" aria-label="Player profile recovery">
            <p role="status">{connected?profileMessage:"Connect to the game server to restore your player."}</p>
            {connected&&profileStatus!=="restoring"&&<>
              <p>Your saved player may be active in another tab. Create another player here to test together; your main profile is kept.</p>
              <div className="profile-recovery-actions" data-controller-row>
                <ControllerAction button="A" className="menu-control" data-profile-action disabled={busy} onClick={()=>void recoverProfile(true)}>NEW TAB PROFILE</ControllerAction>
                <button type="button" className="menu-control" data-profile-action disabled={busy} onClick={()=>void recoverProfile(false)}>RETRY SAVED PROFILE</button>
              </div>
              <small>A tab profile keeps its own styles and progress for reconnects and reloads in this tab. Rename it in Social → Profile.</small>
            </>}
          </div>}
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
          disabled={busy || planned || (!research && (!connected||!profileReady))}
          onClick={() => void next()}
        >

          {busy ? !research&&!profileReady?"PREPARING PLAYER…":"FINDING SERVER…" : planned ? "COMING LATER" : "CONTINUE"}
        </ControllerAction>
      </SelectionFooter>
    </section>
  );
}
