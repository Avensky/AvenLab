import { prepareReconSelection } from "../../store/recon/captureSetup";
import { useCallback, useEffect, useRef, useState } from "react";
import { ControllerButton, MenuShortcuts } from "../../components/controller";
import {
  useAlphaStore,
  HEROES,
  HERO_FILTERS,
  type HeroFilter,
} from "../../store/alpha/alphaStore";
import { useSocialStore } from "../../store/social/socialStore";
import { useNetworkStore } from "../../store/session/networkStore";
import { useUIStore } from "../../store/menus/uiStore";
import { requestSocial } from "../../net/socialClient";
import { useFormNavigation } from "../social/useFormNavigation";
import { deploySelectedHero } from "./sessionActions";
import { ProgressBadge } from "./ProgressBadge";
import { HeroRoster } from "./HeroRoster";
import { HeroPortrait } from "./HeroPortrait";
import { LobbyChat } from "./LobbyChat";
import "./heroSelection.css";
export function HeroSelection({ overlay = false }: { overlay?: boolean } = {}) {
  const selectedMode = useAlphaStore((s) => s.mode),
    heroId = useAlphaStore((s) => s.hero);
  const view = useSocialStore((s) => s.view),
    connected = useNetworkStore((s) => s.connected),
    world = useNetworkStore((s) => s.worldName);
  const active = view?.alpha?.active;
  const mode = overlay && active ? active.mode : selectedMode;
  const [role, setRole] = useState<HeroFilter>("all");
  const [status, setStatus] = useState(""),
    [busy, setBusy] = useState(false);
  const pending = useRef(false),
    root = useRef<HTMLElement>(null);
  const inMode = active?.mode === mode;
  const research = mode === "signal_recon";
  const planned = mode === "swarm";
  const match = mode === "quickplay" || mode === "competitive";
  const customWorld = Boolean(world && !active);
  // Restore the server's locked hero after reconnect or development refresh.
  useEffect(() => {
    if (inMode && active?.hero)
      useAlphaStore.getState().chooseHero(active.hero);
  }, [inMode, active?.hero]);
  const back = useCallback(() => {
    if (pending.current) return;
    if (overlay) {
      useUIStore.getState().backToParentMenu();
      return;
    }
    if (!useNetworkStore.getState().connected) {
      useUIStore.getState().setScreen("mode_select");
      return;
    }
    pending.current = true;
    setBusy(true);
    void requestSocial("mode_cancel")
      .then(() => useUIStore.getState().setScreen("mode_select"))
      .catch((reason) => setStatus((reason as Error).message))
      .finally(() => {
        pending.current = false;
        setBusy(false);
      });
  }, [overlay]);
  const tab = useCallback(
    (dir: number) =>
      setRole(
        (current) =>
          HERO_FILTERS[
            (HERO_FILTERS.indexOf(current) + dir + HERO_FILTERS.length) %
              HERO_FILTERS.length
          ],
      ),
    [],
  );
  useFormNavigation(root, back, tab, true);
  useEffect(() => {
    root.current
      ?.querySelector<HTMLElement>(
        '[data-controller-grid] [aria-pressed="true"], [data-controller-grid] button',
      )
      ?.focus({ preventScroll: true });
  }, []);
  useEffect(() => {
    // A filter can remove the focused card. Keep the directional owner in the
    // new portrait grid instead of moving it to the role tab rail.
    if (!root.current?.contains(document.activeElement))
      root.current
        ?.querySelector<HTMLElement>("[data-controller-grid] button")
        ?.focus({ preventScroll: true });
  }, [role]);
  const choose = async (id: string) => {
    if (pending.current) return;
    const hero = HEROES.find((h) => h.id === id)!;
    if (!inMode) {
      useAlphaStore.getState().chooseHero(id);
      setStatus("");
      return;
    }
    pending.current = true;
    setBusy(true);
    try {
      await requestSocial("hero_select", { hero: id });
      useAlphaStore.getState().chooseHero(id);
      setStatus(`${hero.name} LOCKED`);
    } catch (e) {
      setStatus((e as Error).message);
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  const start = async () => {
    if (pending.current || planned || !heroId) return;
    pending.current = true;
    setBusy(true);
    setStatus("");
    try {
      if (research) {
        prepareReconSelection();
        if (active || customWorld) await requestSocial("mode_cancel");
        useUIStore.getState().setScreen("signal_recon");
      } else if (overlay) {
        useUIStore.getState().closeOverlay();
      } else if (inMode || customWorld) await deploySelectedHero();
      else throw Error("Return to mode selection to find a server first.");
    } catch (e) {
      setStatus((e as Error).message);
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  const roster = (view?.alpha?.roster ?? []).filter(
    (member) => member.mode === mode,
  );
  const ownTeam = inMode ? active.team : "red";
  const teammates = roster
    .filter((member) => member.team === ownTeam)
    .sort((a, b) =>
      a.id === view?.profile.id
        ? -1
        : b.id === view?.profile.id
          ? 1
          : a.name.localeCompare(b.name),
    );
  const selected = HEROES.find((h) => h.id === heroId);
  return (
    <section
      ref={root}
      className="game-ui menu-surface alpha-selection hero-selection"
      data-controller-form
      data-controller-rows
      aria-label={overlay ? "Change hero" : "Hero selection"}
      style={overlay ? { zIndex: 50 } : undefined}
    >
      <header className="alpha-header">
        <div>
          <small>REDLINE VECTOR · ALPHA</small>
          <h1>
            {overlay
              ? "CHANGE HERO"
              : `${mode.replaceAll("_", " ").toUpperCase()} · CHOOSE HERO`}
          </h1>
        </div>
        <ProgressBadge />
        <button
          type="button"
          className="menu-control controller-action"
          onClick={back}
        >
          <ControllerButton button="B" /> BACK
        </button>
      </header>
      <div className="hero-selection-stage">
        {(!match || inMode || overlay) && (
          <HeroRoster
            selected={heroId}
            filter={role}
            busy={busy}
            onFilter={setRole}
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
      {match && inMode && (
        <div
          className="alpha-squad-bar hero-team-strip"
          aria-label="Teammate hero selections"
        >
          {Array.from({ length: 5 }, (_, index) => {
            const member = teammates[index],
              hero = HEROES.find((h) => h.id === member?.hero);
            return (
              <div
                key={member?.id ?? index}
                className="alpha-squad-seat"
                data-role={hero?.role}
                title={
                  member
                    ? `${hero?.name ?? "Hero"} · ${member.name}`
                    : "Waiting for player"
                }
              >
                <HeroPortrait
                  key={member?.hero ?? "empty"}
                  hero={member?.hero ?? null}
                />
                <div>
                  <strong>{hero?.name ?? "OPEN SLOT"}</strong>
                  <small>
                    {member
                      ? member.name +
                        (member.reconnecting ? " · RECONNECTING" : "")
                      : "WAITING"}
                  </small>
                </div>
              </div>
            );
          })}
        </div>
      )}
      <footer className="alpha-selection-footer" data-controller-row>
        <MenuShortcuts chat directions="both" tabKey />
        <button
          type="button"
          className="menu-control controller-action alpha-deploy"
          disabled={
            busy ||
            planned ||
            !selected ||
            (!research && (!connected || !view || (!inMode && !customWorld)))
          }
          onClick={() => void start()}
        >
          <ControllerButton button="A" />
          {busy
            ? "PLEASE WAIT…"
            : planned
              ? "COMING LATER"
              : research
                ? "ENTER SIGNAL RECON"
                : overlay
                  ? "RETURN TO GAME"
                  : inMode || customWorld
                    ? "DEPLOY"
                    : "CHOOSE A HERO"}
        </button>
      </footer>
    </section>
  );
}
