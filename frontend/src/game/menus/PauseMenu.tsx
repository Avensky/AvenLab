import { ControlGlyph, MenuShortcuts } from "../../components/controller";
import { useMenuInputDevice } from "../../components/controller/useMenuInputDevice";
import { trapMenuFocus } from "../../components/menus/menuFocus";
import { useEffect, useId, useRef } from "react";
import { useUIStore } from "../../store/menus/uiStore";
import { GameButton } from "../../components/GameButton";
import { PAUSE_MENU_ITEMS, PAUSE_MENU_RAILS, PAUSE_RESUME_INDEX } from "./menuItems";
import { MenuIcon } from "../../components/menus/MenuIcon";
import "./pauseMenu.css";

export function PauseMenu() {
  const selectedIndex = useUIStore((s) => s.selectedMenuIndexById.pause);
  const setIndex = useUIStore((s) => s.setActiveMenuIndex);
  const activate = useUIStore((s) => s.activateActiveMenuSelection);
  const inputDevice = useMenuInputDevice();
  const resumeSelected = selectedIndex === PAUSE_RESUME_INDEX;
  const headingId = useId();
  const buttons = useRef<Array<HTMLDivElement | null>>([]);
  useEffect(() => {
    const element = buttons.current[selectedIndex];
    element?.focus({ preventScroll: true });
    element?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  const renderAction = (index: number) => {
    const item = PAUSE_MENU_ITEMS[index];
    const resume = index === PAUSE_RESUME_INDEX;
    return (
      <GameButton
        key={item.id}
        ref={(element) => {
          buttons.current[index] = element;
        }}
        selected={selectedIndex === index}
        variant="menu"
        onFocus={() => setIndex(index)}
        onPress={() => {
          setIndex(index);
          activate();
        }}
        aria-label={item.label}
        data-pause-action={item.id}
        className={resume ? "pause-menu-resume menu-panel-frame" : "menu-row menu-action"}
      >
        {resume ? (
          <>
            <span className="pause-menu-resume-mark" aria-hidden="true">
              {resumeSelected && inputDevice !== "touch"
                ? <ControlGlyph controller="A" />
                : <MenuIcon name="resume" />}
            </span>
            Resume
          </>
        ) : (
          <>
            <MenuIcon name={item.id} />
            {item.label}
          </>
        )}
      </GameButton>
    );
  };

  return (
    <div className="game-ui menu-surface menu-home pause-menu fixed inset-0 z-50">
      <section
        onKeyDown={trapMenuFocus}
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        className="pause-menu-content"
        data-input-device={inputDevice}
      >
        <header className="pause-menu-heading pause-menu-glass menu-panel-frame">
          <h2 id={headingId}>Game menu</h2>
        </header>
        <div className="pause-menu-rails">
          {PAUSE_MENU_RAILS.map(({ label, indices, controller, keyboard }) => (
            <section key={label} className="pause-menu-rail pause-menu-glass menu-panel-frame" aria-label={label}>
              <h3>{label}<ControlGlyph controller={controller} keyboard={keyboard} /></h3>
              <div className="menu-row-list">{indices.map(renderAction)}</div>
            </section>
          ))}
        </div>
        <footer className="pause-menu-footer pause-menu-glass menu-panel-frame">
          {inputDevice !== "touch" && <MenuShortcuts menuToggle directions="both" selectAction={false} back={false} tabs={false} />}
          {renderAction(PAUSE_RESUME_INDEX)}
          {inputDevice !== "touch" && <MenuShortcuts navigate={false} tabs={false} selectAction={!resumeSelected} />}
        </footer>
      </section>
    </div>
  );
}
