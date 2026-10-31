import { useCallback, useEffect, useRef, useState } from "react";
import { ControllerButton, MenuShortcuts } from "../../components/controller";
import {
  useAlphaStore,
  GAME_MODES,
  HEROES,
  type HeroRole,
} from "../../store/alpha/alphaStore";
import { useSocialStore } from "../../store/social/socialStore";
import {
  useSelectionStore,
  mapCatalog,
} from "../../store/selection/selectionStore";
import { useNetworkStore } from "../../store/session/networkStore";
import { useUIStore } from "../../store/menus/uiStore";
import { requestSocial } from "../../net/socialClient";
import { useFormNavigation } from "../social/useFormNavigation";
import { joinSelectedMode, deploySelectedHero } from "./sessionActions";
import { ProgressBadge } from "./ProgressBadge";
import "./alpha.css";
const ROLES: HeroRole[] = ["tank", "dps", "support"];
export function HeroSelection({ overlay = false }: { overlay?: boolean } = {}) {
  const selectedMode = useAlphaStore((s) => s.mode),
    heroId = useAlphaStore((s) => s.hero);
  const view = useSocialStore((s) => s.view),
    connected = useNetworkStore((s) => s.connected),
    world = useNetworkStore((s) => s.worldName);
  const active = view?.alpha?.active;
  const mode = overlay && active ? active.mode : selectedMode;
  const map = useSelectionStore((s) => s.getSelectedMap());
  const [role, setRole] = useState<HeroRole>(
    () =>
      HEROES.find(
        (h) =>
          h.id ===
          (overlay || active?.mode === mode
            ? (active?.hero ?? heroId)
            : heroId),
      )?.role ?? "dps",
  );
  const [status, setStatus] = useState(""),
    [busy, setBusy] = useState(false);
  const pending = useRef(false),
    root = useRef<HTMLElement>(null);
  const inMode = active?.mode === mode;
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
      setRole((current) => ROLES[(ROLES.indexOf(current) + dir + 3) % 3]),
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
  const start = async () => {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setStatus("");
    try {
      if (overlay) {
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
      className="game-ui menu-surface alpha-selection"
      data-controller-form
      aria-label={overlay ? "Change hero" : "Mode and hero selection"}
      style={overlay ? { zIndex: 50 } : undefined}
    >
      <header className="alpha-header">
        <div>
          <small>REDLINE VECTOR · ALPHA</small>
          <h1>{overlay ? "CHANGE HERO" : "CHOOSE YOUR MODE & HERO"}</h1>
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
              aria-pressed={mode === item.id}
              disabled={busy}
              onClick={() => {
                useAlphaStore.getState().chooseMode(item.id);
                setStatus("");
              }}
            >
              {item.label}
            </button>
          ))}
        </nav>
      )}
      <div className="alpha-squad-bar" aria-label="Teammate hero selections">
        <span>
          {mode === "quickplay" || mode === "competitive"
            ? `${inMode ? ownTeam.toUpperCase() + " TEAM" : "LIVE ALPHA ROSTER"} · 5v5`
            : `${mode === "editor" ? "EDITOR" : "SOLO"} TEST · ANY ROLE`}
        </span>
        {(mode === "quickplay" || mode === "competitive") &&
          Array.from({ length: 5 }, (_, index) => {
            const member = teammates[index],
              hero = HEROES.find((h) => h.id === member?.hero);
            return (
              <div
                key={member?.id ?? index}
                className="alpha-squad-seat"
                data-role={hero?.role}
              >
                <strong>{hero?.name ?? "OPEN SLOT"}</strong>
                <small>
                  {member
                    ? member.name +
                      (member.reconnecting ? " · RECONNECTING" : "")
                    : "WAITING FOR TEAMMATE"}
                </small>
              </div>
            );
          })}
      </div>
      <div className="alpha-model-space" aria-hidden="true" />
      <div className="alpha-hero-workbench">
        <div className="alpha-hero-tools">
          <nav role="tablist" aria-label="Hero role">
            {ROLES.map((item) => (
              <button
                key={item}
                type="button"
                role="tab"
                aria-selected={role === item}
                className="menu-control"
                onClick={() => setRole(item)}
              >
                {item.toUpperCase()}
              </button>
            ))}
          </nav>
          {(mode === "sandbox" || mode === "editor") &&
          !inMode &&
          !customWorld ? (
            <label>
              ENVIRONMENT{" "}
              <select
                aria-label="Practice environment"
                value={map.id}
                onChange={(event) =>
                  useSelectionStore.setState({
                    mapIndex: mapCatalog.findIndex(
                      (m) => m.id === event.currentTarget.value,
                    ),
                  })
                }
              >
                {mapCatalog.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <span className="alpha-map-label">
              {world ?? "STREAMING ENDLESS CITY · ALPHA TEST"}
            </span>
          )}
        </div>
        <div
          className="alpha-hero-wall"
          role="group"
          aria-label={`${role.toUpperCase()} heroes`}
        >
          {HEROES.filter((h) => h.role === role).map((hero) => (
            <button
              type="button"
              key={hero.id}
              data-hero={hero.id}
              data-role={hero.role}
              className="menu-control alpha-hero"
              disabled={busy}
              aria-pressed={heroId === hero.id}
              onClick={() => void choose(hero.id)}
            >
              <svg viewBox="0 0 100 48" aria-hidden="true">
                <path
                  d={
                    hero.role === "tank"
                      ? "M10 27h80v12H10zM25 17h50v10H25zM48 9h35v5H48zM8 39h84"
                      : "M10 28l14-4 12-13h31l14 13 9 4v11H10zM32 24h39M20 39a6 6 0 1 0 12 0M68 39a6 6 0 1 0 12 0"
                  }
                />
                {hero.role === "support" && <path d="M50 18v16M42 26h16" />}
              </svg>
              <strong>{hero.name}</strong>
              <small>{hero.role.toUpperCase()}</small>
            </button>
          ))}
        </div>
        <p className="alpha-hero-caption">
          {selected.note} ·{" "}
          {mode === "quickplay" || mode === "competitive"
            ? view?.alpha?.role_limits === false
              ? "FLEX TEST · ANY COMBINATION"
              : "TEAM RULE: 1 TANK · 2–3 DPS · 1–2 SUPPORT"
            : "TESTING: ANY COMBINATION"}
        </p>
        <p className="alpha-status" role="status">
          {status ||
            (!connected
              ? "CONNECTING TO ALPHA SERVER…"
              : GAME_MODES.find((item) => item.id === mode)?.description)}
        </p>
      </div>
      <footer className="alpha-selection-footer">
        <MenuShortcuts />
        <button
          type="button"
          className="menu-control alpha-deploy"
          disabled={busy || !connected || !view}
          onClick={() => void start()}
        >
          <ControllerButton button="A" />
          {busy
            ? "PLEASE WAIT…"
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
