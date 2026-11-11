import { MenuLogo } from "../../components/menus/MenuLogo";
import { useEffect, useId, useMemo, useRef, type CSSProperties } from "react";
import { AttackIcon } from "../../combat/AttackIcon";
import { ControllerAction } from "../../components/controller";
import { MenuFooter } from "../../components/menus/MenuFrame";
import { MenuIcon } from "../../components/menus/MenuIcon";
import { MenuVideoBackground } from "../../components/menus/MenuVideoBackground";
import { trapMenuFocus } from "../../components/menus/menuFocus";
import { canDrive, type MenuAction } from "../../controls/inputRouting";
import { HEROES, matchModeLabel, modeTeamSize } from "../../store/alpha/alphaStore";
import { canChangeMatchHero, isCurrentMatchRound } from "../../store/alpha/matchHeroChange";
import { useScoreboardStore } from "../../store/hud/scoreboardStore";
import { useUIStore } from "../../store/menus/uiStore";
import { useMotionView } from "../../store/session/networkViews";
import { useSocialStore } from "../../store/social/socialStore";
import { CharacterPortrait } from "../characters/CharacterPortrait";
import { CharacterHeaderProfile } from "../characters/CharacterHeaderProfile";
import { characterLook } from "../characters/characterCatalog";
import { TeamPortraitBadge } from "./TeamPortraitBadge";
import { formatStat, selectedTeamPlayers } from "./scoreboardData";

const roleIcons = { tank: "shield", dps: "coax", support: "repair" } as const;

/** Open once in a real spawn with a full set of confirmed teammates. */
export function TeamLineup() {
  const view = useSocialStore(state => state.view);
  const active = view?.alpha?.active;
  const overlay = useUIStore(state => state.overlay);
  const loading = useUIStore(state => state.isModeLoading);
  const inspecting = useScoreboardStore(state => state.held || state.pinned);
  const atSpawn = useMotionView(state => canChangeMatchHero(state, active));
  const roundConfirmed = useMotionView(state => isCurrentMatchRound(state, active));
  const matchKey = roundConfirmed && active ? `${view?.profile.id}:${active.world_id}:${active.match_id}` : null;
  const size = modeTeamSize(active?.mode ?? "", active?.team_size);
  const players = useMemo(() => selectedTeamPlayers(view), [view]);
  const assembled = players.length === size && players.every(player => player.status === "ready");
  const shownFor = useRef<string | null>(null);
  const change = useRef<HTMLButtonElement>(null);
  const proceed = useRef<HTMLButtonElement>(null);
  const title = useId();
  const visible = overlay === "team_lineup" && matchKey !== null;
  const close = useUIStore(state => state.closeOverlay);
  const openPicker = useUIStore(state => state.openVehicleSelection);

  useEffect(() => {
    if (overlay === "team_lineup" && (!matchKey || shownFor.current !== matchKey)) {
      close();
      return;
    }
    if (overlay !== null || loading || inspecting || !atSpawn || !assembled || !matchKey ||
      shownFor.current === matchKey || !canDrive()) return;
    shownFor.current = matchKey;
    useUIStore.getState().setOverlay("team_lineup");
  }, [assembled, atSpawn, close, inspecting, loading, matchKey, overlay]);

  useEffect(() => {
    if (!visible) return;
    if (!atSpawn || document.activeElement !== change.current) proceed.current?.focus({ preventScroll: true });
    const onAction = (event: Event) => {
      const action = (event as CustomEvent<MenuAction>).detail;
      if (action === "back") close();
      else if (action === "activate") {
        if (change.current && document.activeElement === change.current) openPicker();
        else close();
      } else if (action === "left" || action === "up") change.current?.focus({ preventScroll: true });
      else if (action === "right" || action === "down") proceed.current?.focus({ preventScroll: true });
    };
    window.addEventListener("avenlab:panel-action", onAction);
    return () => window.removeEventListener("avenlab:panel-action", onAction);
  }, [atSpawn, close, openPicker, visible]);

  if (!visible || !active) return null;
  return (
    <section className="team-lineup game-ui menu-surface" role="dialog" aria-modal="true" aria-labelledby={title}
      onKeyDown={trapMenuFocus}>
      <MenuVideoBackground />
      <header className="team-lineup-heading">
        <p>{matchModeLabel(active.mode, active.team_size)} <span data-team={active.team}>{active.team} team</span></p>
        <div className="menu-title-with-logo">
          <MenuLogo compact />
          <h1 id={title}>Team assembled</h1>
          <CharacterHeaderProfile compact readOnly />
        </div>
      </header>
      <div className="team-lineup-cards" style={{ "--lineup-size": size } as CSSProperties}>
        {Array.from({ length: size }, (_, index) => {
          const player = players[index];
          const hero = HEROES.find(item => item.id === player?.hero);
          if (!player || !hero) return (
            <article className="team-lineup-card menu-panel-frame" key={index} aria-label="Empty hero slot">
              <TeamPortraitBadge />
            </article>
          );
          const character = characterLook(player.character)?.character;
          return (
            <article className="team-lineup-card menu-panel-frame" key={player.id} data-self={player.self}>
              <header>
                <span className="team-lineup-role"><AttackIcon kind={roleIcons[hero.role]} />{hero.role}</span>
                <span>Level {formatStat(player.level)}</span>
              </header>
              <TeamPortraitBadge player={player} />
              <small className="team-lineup-vehicle" title={hero.name}>{hero.name}</small>
              <div className="team-lineup-identity">
                {character && <CharacterPortrait choice={player.character} compact label={character.name} />}
                <strong title={player.name}>{player.name}</strong>
              </div>
            </article>
          );
        })}
      </div>
      <MenuFooter className="team-lineup-actions">
        <button type="button" className="menu-control menu-panel-frame" disabled={!atSpawn} ref={change} onClick={openPicker}>
          <MenuIcon name="vehicle_select" /> Change Hero
        </button>
        <ControllerAction button="A" className="menu-control menu-panel-frame" ref={proceed} onClick={close}>Continue</ControllerAction>
      </MenuFooter>
    </section>
  );
}
