import { useConnectionView } from "../../store/session/networkViews";
import { SceneTabHeader } from "../../components/menus/SceneTabHeader";
import { useMenuPressOwner } from "../../components/menus/useMenuPressOwner";
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
  isPlannedMode,
  isPlayMenuMode,
  canonicalGameMode,
  type MatchTeamSize,
  type PlayMode,
} from "../../store/alpha/alphaStore";
import { useUIStore } from "../../store/menus/uiStore";

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
import { SelectionFooter } from "./SelectionChrome";
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
  const connected = useConnectionView(s => s.connected);
  const root = useRef<HTMLElement>(null),
    pending = useRef(false);
  const [busy, setBusy] = useState(false),
    [status, setStatus] = useState("");
  const [canField, setCanField] = useState(0);
  const research = mode === "signal_recon";
  const planned = isPlannedMode(mode);
  const match = isMatchMode(mode);
  const play = isPlayMenuMode(mode);
  const destinations = GAME_MODES.filter(entry => isPlayMenuMode(entry.id) === play);
  const item = GAME_MODES.find((m) => m.id === canonicalGameMode(mode))!;
  const pressOwner = useMenuPressOwner();
  const back = useCallback(() => {
    if (!pending.current) useUIStore.getState().setScreen("main");
  }, []);
  const selectMode = useCallback((id: string) => {
    if (pending.current) return;
    useAlphaStore.getState().chooseMode(id as PlayMode);
    setStatus("");
  }, []);
  const tab = useCallback((direction: number) => {
    const current = useAlphaStore.getState().mode;
    const entries = GAME_MODES.filter(entry => isPlayMenuMode(entry.id) === isPlayMenuMode(current));
    const index = entries.findIndex(entry => entry.id === canonicalGameMode(current));
    selectMode(entries[(index + direction + entries.length) % entries.length].id);
  }, [selectMode]);
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
  const next = useCallback(async (requestedSize?: MatchTeamSize) => {
    if (pending.current || planned) return;
    const focusedSize=Number((document.activeElement as HTMLElement|null)?.closest<HTMLElement>("[data-match-size]")?.dataset.matchSize);
    const size=requestedSize??focusedSize;
    // Activating a size is the primary action: commit it before the shared
    // profile/admission checks, without a second Continue press.
    if(isMatchMode(useAlphaStore.getState().mode)&&(size===3||size===5))selectMatchSize(size);
    if(!research&&!profileReady){
      const active=document.activeElement as HTMLButtonElement|null;
      if(requestedSize===undefined&&active?.matches('[data-profile-action]:not(:disabled)'))active.click();
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
      if (["up", "down"].includes(action) && root.current) {
        const actions = [...root.current.querySelectorAll<HTMLButtonElement>("[data-selection-action]:not(:disabled), [data-match-size]:not(:disabled)")];
        const index = actions.indexOf(document.activeElement as HTMLButtonElement);
        actions[(index + (action === "up" ? -1 : 1) + actions.length) % actions.length]?.focus({ preventScroll: true });
        return;
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
      {...pressOwner}
      ref={root}
      className="game-ui menu-surface alpha-selection hero-selection mode-selection"
      data-play-category={play ? "play" : "tools"}
      data-controller-form
      data-controller-rows
      tabIndex={-1}
      aria-label="Game mode selection"
    >
      <SceneTabHeader
        title={play ? "PLAY" : "EXPLORE"}
        compact
        character={{ showProgress: true }}
        busy={busy}
        tablistLabel="Game mode"
        tablistClassName="alpha-mode-tabs"
        idPrefix="mode-selection"
        panelId="mode-selection-panel"
        activeTab={item.id}
        tabs={destinations.map(entry => ({ id: entry.id, label: entry.label, badge: isPlannedMode(entry.id) ? "PLANNED" : undefined }))}
        onTabChange={selectMode}
      />
      <div className="hero-selection-stage" id="mode-selection-panel" role="tabpanel" aria-labelledby={"mode-selection-tab-" + item.id}>
        {(mode==='sandbox'||mode==='editor')&&<WorldPortraitCard map={selectedWorld}/>}
        {match && <MatchModePortraits selected={teamSize} disabled={busy} onSelect={size=>void next(size)}/>}
        <section className="hero-summary" aria-label="Selected game mode">
          <small>GAME MODE</small>
          <h2>{item.label}</h2>
          {match&&<p className="alpha-status" role="note">{teamSize===3?'3 VS 3 · One Tank, DPS and Support per team. ':'5 VS 5 · '}First to 3 captures · 15 minutes. Career records are live; {mode==='competitive'?'ranked MMR is pending.':'choose a match size to find a game.'}</p>}
          {mode === "solo" && <p className="alpha-status" role="note">{item.description} City course in development.</p>}
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
      <SelectionFooter
        chat
        secondaryTabs={research}
        hasPrimaryAction
        backAction={{ onClick: back, disabled: busy }}
      >
        <ControllerAction button="A"
          type="button"
          className="menu-control  alpha-deploy"
          disabled={busy || planned || (!research && (!connected||!profileReady))}
          onClick={() => void next(isMatchMode(mode)?useAlphaStore.getState().teamSize:undefined)}
        >

          {busy ? !research&&!profileReady?"PREPARING PLAYER…":"FINDING SERVER…" : planned ? "COMING LATER" : "CONTINUE"}
        </ControllerAction>
      </SelectionFooter>
    </section>
  );
}
