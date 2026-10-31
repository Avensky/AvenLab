import { useCallback, useEffect, useRef, useState } from "react";
import { ControllerButton, MenuShortcuts } from "../../components/controller";
import {
  useAlphaStore,
  GAME_MODES,
  HEROES,
  HERO_FILTERS,
  type HeroFilter,
} from "../../store/alpha/alphaStore";
import { useSocialStore } from "../../store/social/socialStore";
import { useSelectionStore } from "../../store/selection/selectionStore";
import { VehicleSelector } from "../modes/VehicleSelector";
import { MapSelector } from "../modes/MapSelector";
import { useNetworkStore } from "../../store/session/networkStore";
import { useUIStore } from "../../store/menus/uiStore";
import { requestSocial } from "../../net/socialClient";
import { useFormNavigation } from "../social/useFormNavigation";
import { joinSelectedMode, deploySelectedHero } from "./sessionActions";
import { ProgressBadge } from "./ProgressBadge";
import { HeroRoster, HeroRoleTabs } from "./HeroRoster";
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
  const map = useSelectionStore((s) => s.getSelectedMap());
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
      useUIStore.getState().setScreen("main");
      return;
    }
    pending.current = true;
    setBusy(true);
    void requestSocial("mode_cancel")
      .then(() => useUIStore.getState().setScreen("main"))
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
  useFormNavigation(root, back, tab);
  useEffect(() => {
    const selected = root.current?.querySelector<HTMLElement>(
      `[data-hero="${useAlphaStore.getState().hero}"]`,
    );
    (
      selected ?? root.current?.querySelector<HTMLElement>("[data-hero]")
    )?.focus({ preventScroll: true });
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
  // Arrows and portraits share one validated selection path, including support
  // heroes that reuse a chassis. Cycle only within the current role filter.
  const cycleHero = (direction: number) => {
    const heroes = HEROES.filter(
      (hero) => role === "all" || hero.role === role,
    );
    const index = heroes.findIndex((hero) => hero.id === heroId);
    const next =
      index < 0
        ? direction > 0
          ? 0
          : heroes.length - 1
        : (index + direction + heroes.length) % heroes.length;
    void choose(heroes[next].id);
  };
  const start = async () => {
    if (pending.current || planned) return;
    pending.current = true;
    setBusy(true);
    setStatus("");
    try {
      if (research) {
        if (active || customWorld) await requestSocial("mode_cancel");
        useUIStore.getState().setScreen("signal_recon_setup");
      } else if (overlay) {
        useUIStore.getState().closeOverlay();
      } else if (inMode || customWorld) await deploySelectedHero();
      else {
        const joined = await joinSelectedMode();
        if (joined.status === "joined")
          setStatus("SEAT RESERVED · CHOOSE YOUR HERO, THEN DEPLOY");
      }
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
  const selected = HEROES.find((h) => h.id === heroId)!;
  return (
    <section
      ref={root}
      className="game-ui menu-surface alpha-selection hero-selection"
      data-controller-form
      aria-label={overlay ? "Change hero" : "Mode and hero selection"}
      style={overlay ? { zIndex: 50 } : undefined}
    >
      <header className="alpha-header">
        <div>
          <small>REDLINE VECTOR · ALPHA</small>
          <h1>{overlay ? "CHANGE HERO" : "MODE & HERO"}</h1>
        </div>
        <ProgressBadge />
        <button type="button" className="menu-control" onClick={back}>
          <ControllerButton button="B" /> BACK
        </button>
      </header>
      {!overlay && (
        <nav className="alpha-mode-tabs" aria-label="Game mode">
          {GAME_MODES.map((item) => (
            <button
              key={item.id}
              type="button"
              className="menu-control"
              aria-label={item.label}
              aria-pressed={mode === item.id}
              disabled={busy}
              onClick={() => {
                useAlphaStore.getState().chooseMode(item.id);
                setStatus("");
              }}
            >
              {item.label}
              {item.id === "swarm" && (
                <small className="alpha-mode-planned" aria-hidden="true">
                  PLANNED
                </small>
              )}
            </button>
          ))}
        </nav>
      )}
      {match && (
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
      <div className="hero-selection-stage">
        <HeroRoster
          selected={heroId}
          filter={role}
          busy={busy}
          onChoose={(id) => void choose(id)}
        />
        <section
          className="hero-summary"
          aria-label="Selected hero"
          data-role={selected.role}
        >
          <small>{selected.role.toUpperCase()}</small>
          <h2>{selected.name}</h2>
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
      <section className="hero-vehicle-bar" aria-label="Vehicle selection">
        <HeroRoleTabs filter={role} onFilter={setRole} />
        <VehicleSelector
          formNavigation
          translucent
          showRole={false}
          showCanSlug={false}
          showNotes={false}
          disabled={busy}
          title={selected.name}
          onPrevious={() => cycleHero(-1)}
          onNext={() => cycleHero(1)}
        />
        {(mode === "sandbox" || mode === "editor") && (
          <MapSelector
            formNavigation
            translucent
            showDesc={false}
            disabled={busy || inMode || customWorld}
            title={inMode || customWorld ? (world ?? map.name) : map.name}
          />
        )}
      </section>
      <footer className="alpha-selection-footer">
        <MenuShortcuts />
        <button
          type="button"
          className="menu-control alpha-deploy"
          disabled={busy || planned || (!research && (!connected || !view))}
          onClick={() => void start()}
        >
          <ControllerButton button="A" />
          {busy
            ? "PLEASE WAIT…"
            : planned
              ? "COMING LATER"
              : research
                ? "OPEN SIGNAL RECON"
                : overlay
                  ? "RETURN TO GAME"
                  : inMode || customWorld
                    ? "DEPLOY"
                    : "JOIN LOBBY / QUEUE"}
        </button>
      </footer>
    </section>
  );
}
