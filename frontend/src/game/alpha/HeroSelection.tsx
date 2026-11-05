import { useConnectionView } from "../../store/session/networkViews";
import {useScoreboardStore} from '../../store/hud/scoreboardStore';
import { unavailableHeroes } from "./heroAvailability";
import { prepareReconSelection } from "../../store/recon/captureSetup";
import { useCallback, useEffect, useRef, useState } from "react";
import { ControllerAction } from "../../components/controller";
import {
  useAlphaStore,
  HEROES,
  HERO_FILTERS,
  isMatchMode,
  matchModeLabel,
  canonicalGameMode,
  modeTeamSize,
  type HeroFilter,
} from "../../store/alpha/alphaStore";
import { useSocialStore } from "../../store/social/socialStore";
import { useNetworkStore } from "../../store/session/networkStore";
import { useUIStore } from "../../store/menus/uiStore";
import { requestSocial } from "../../net/socialClient";
import { useSelectionNavigation } from "./useSelectionNavigation";
import { navigateFormRows } from "../social/formRows";
import type { MenuAction } from "../../controls/inputRouting";
import { deploySelectedHero } from "./sessionActions";
import {SelectionHeader,SelectionFooter} from './SelectionChrome';
import { HeroRoster } from "./HeroRoster";
import { PreMatchTeamPreview } from "../stats/PreMatchTeamPreview";
import { LobbyChat } from "./LobbyChat";
import "./heroSelection.css";
export function HeroSelection({ overlay = false }: { overlay?: boolean } = {}) {
  const inspecting=useScoreboardStore(s=>s.held||s.pinned);
  const selectedMode = useAlphaStore((s) => s.mode),
    selectedTeamSize=useAlphaStore(s=>s.teamSize),
    heroId = useAlphaStore((s) => s.hero),
    previewId = useAlphaStore((s) => s.previewHero);
  const view = useSocialStore((s) => s.view),
    connected = useConnectionView(s => s.connected),
    world = useConnectionView(s => s.worldName);
  const active = view?.alpha?.active;
  const mode = overlay && active ? active.mode : selectedMode;
  const [role, setRole] = useState<HeroFilter>("all");
  const [status, setStatus] = useState(""),
    [busy, setBusy] = useState(false);
  const pending = useRef(false),
    root = useRef<HTMLElement>(null);
  const inMode = !!active&&canonicalGameMode(active.mode)===canonicalGameMode(mode)&&(!isMatchMode(mode)||modeTeamSize(active.mode,active.team_size)===selectedTeamSize||overlay);
  const research = mode === "signal_recon";
  const planned = mode === "swarm";
  const match = isMatchMode(mode);
  const confirmedTeam = match && inMode && (active?.team === "red" || active?.team === "blue")
    ? active.team : undefined;
  const customWorld = Boolean(world && !active);
  // Hydrate an existing pick once per admission, including reconnect/refresh.
  // Replaceable lobby views can trail request acknowledgements; an old view
  // must not overwrite a newer local preview or restore a choice after Back.
  useEffect(() => {
    if (!inMode || !active || useAlphaStore.getState().selectionInitialized)
      return;
    if (active.hero) useAlphaStore.getState().chooseHero(active.hero);
    else useAlphaStore.setState({ selectionInitialized: true });
  }, [inMode, active]);
  const remembered = useRef(new WeakMap<HTMLElement, number>());
  const filter = useCallback((next: HeroFilter) => {
    if (pending.current) return;
    setRole(next);

  }, []);
  const tab = useCallback(
    (step: number) => {
      filter(
        HERO_FILTERS[
          (HERO_FILTERS.indexOf(role) + step + HERO_FILTERS.length) %
            HERO_FILTERS.length
        ],
      );
    },
    [filter, role],
  );
  const direction = useCallback((action: MenuAction) => {
    if (pending.current || !root.current) return;
    navigateFormRows(
      root.current,
      document.activeElement as HTMLElement,
      action,
      remembered.current,
    );
  }, []);
  useEffect(() => {
    root.current?.focus({ preventScroll: true });
  }, []);
  useEffect(() => {
    const id = useAlphaStore.getState().previewHero;
    if (id)
      root.current
        ?.querySelector<HTMLElement>(`[data-hero="${id}"]`)
        ?.focus({ preventScroll: true });
  }, [role]);
  const back = useCallback(async () => {
    if (pending.current) return;
    if (overlay) {
      useUIStore.getState().backToParentMenu();
      return;
    }
    const selection = useAlphaStore.getState();
    const current = useSocialStore.getState().view?.alpha?.active;
    if (selection.hero || selection.previewHero) {
      pending.current = true;
      setBusy(true);
      try {
        if (selection.hero && current)
          await requestSocial("hero_select", { hero: "" });
        selection.clearHero();
        setStatus("");
        root.current?.focus({ preventScroll: true });
      } catch (error) {
        setStatus((error as Error).message);
      } finally {
        pending.current = false;
        setBusy(false);
      }
      return;
    }
    if (
      !useNetworkStore.getState().connected ||
      (!current && !useNetworkStore.getState().worldName)
    ) {
      useUIStore.getState().setScreen("mode_select");
      return;
    }
    pending.current = true;
    setBusy(true);
    try {
      await requestSocial("mode_cancel");
      useUIStore.getState().setScreen("mode_select");
    } catch (error) {
      setStatus((error as Error).message);
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }, [overlay]);
  const choose = useCallback(
    async (id: string) => {
      if (pending.current || planned) return;
      if (!research && (!connected || !view || (!inMode && !customWorld)))
        return;
      const hero = HEROES.find((h) => h.id === id);
      if (!hero) return;
      const unavailable = unavailableHeroes(useSocialStore.getState().view?.alpha, mode, useSocialStore.getState().view?.profile.id);
      if (unavailable[id]) { setStatus(unavailable[id]); return; }
      pending.current = true;
      setBusy(true);
      setStatus("");
      try {
        const state = useAlphaStore.getState();
        if (state.hero === id) {
          // The second A applies only to the exact confirmed preview. Changing
          // focus never deploys an older locked hero behind a different model.
          if (research) {
            prepareReconSelection();
            if (active || customWorld) await requestSocial("mode_cancel");
            useUIStore.getState().setScreen("signal_recon");
          } else if (overlay) useUIStore.getState().closeOverlay();
          else if (inMode || customWorld) await deploySelectedHero();
          else throw Error("Return to mode selection to find a server first.");
        } else {
          if (inMode) await requestSocial("hero_select", { hero: id });
          useAlphaStore.getState().chooseHero(id);
          setStatus("");
        }
      } catch (error) {
        setStatus((error as Error).message);
      } finally {
        pending.current = false;
        setBusy(false);
      }
    },
    [planned, research, active, customWorld, overlay, inMode, connected, view, mode],
  );
  const confirm = useCallback(() => {
    const focused = (document.activeElement as HTMLElement | null)?.closest<HTMLElement>("[data-hero]");
    const id = focused?.dataset.hero ??
      useAlphaStore.getState().previewHero ??
      HEROES.find((h) => role === "all" || h.role === role)!.id;
    void choose(id);
  }, [choose, role]);
  useSelectionNavigation(root, { confirm, back, direction, tab });
  const selected = HEROES.find((h) => h.id === previewId);
  return (
    <section
      ref={root}
      inert={inspecting}
      className="game-ui menu-surface alpha-selection hero-selection"
      data-controller-form
      data-controller-rows
      tabIndex={-1}
      aria-label={overlay ? "Change hero" : "Hero selection"}
      style={overlay ? { zIndex: 50, background:"transparent", backdropFilter:"none" } : undefined}
    >
      <SelectionHeader title={overlay?'CHANGE HERO':'CHOOSE HERO'} eyebrow={matchModeLabel(mode,active&&inMode?active.team_size:selectedTeamSize)} team={confirmedTeam} onBack={()=>void back()} busy={busy}/>
      <div className="hero-selection-stage">
        {(!match || inMode || overlay) && (
          <HeroRoster
            selected={heroId}
            filter={role}
            busy={busy}
            onFilter={filter}
            unavailable={unavailableHeroes(view?.alpha, mode, view?.profile.id)}
            onChoose={(id) => void choose(id)}
          />
        )}
        <section
          className="hero-summary"
          aria-label="Selected hero"
          data-role={selected?.role}
        >
          <small>{selected?.role.toUpperCase() ?? "CHOOSE YOUR HERO"}</small>
          <h2>{selected?.name ?? "AWAITING PICK"}</h2>
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
      {match && inMode && !overlay && <PreMatchTeamPreview key={`${active.world_id}:${mode}`} view={view}/>}
      <SelectionFooter chat>
        <ControllerAction button="A"
          type="button"
          className="menu-control  alpha-deploy"
          disabled={
            busy ||
            planned ||
            (!research && (!connected || !view || (!inMode && !customWorld)))
          }
          onClick={confirm}
        >

          {busy
            ? "PLEASE WAIT…"
            : planned
              ? "COMING LATER"
              : !heroId || heroId !== previewId
                ? "SELECT HERO"
                : research
                  ? "ENTER SIGNAL RECON"
                  : overlay
                    ? "RETURN TO GAME"
                    : inMode || customWorld
                      ? "DEPLOY"
                      : "CHOOSE A HERO"}
        </ControllerAction>
      </SelectionFooter>
    </section>
  );
}
