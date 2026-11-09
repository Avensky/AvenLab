import { MenuShortcuts } from "../../components/controller";
import { trapMenuFocus } from "../../components/menus/menuFocus";
import { useEffect, useId, useRef } from "react";
import { useUIStore } from "../../store/menus/uiStore";
import { GameButton } from "../../components/GameButton";
import { PAUSE_MENU_ITEMS } from "./menuItems";
import { MenuIcon } from "../../components/menus/MenuIcon";

export function PauseMenu() {
  const selectedIndex = useUIStore((s) => s.selectedMenuIndexById.pause);
  const setIndex = useUIStore((s) => s.setActiveMenuIndex);
  const headingId = useId();
  const buttons = useRef<Array<HTMLDivElement | null>>([]);
  useEffect(() => {
    const element = buttons.current[selectedIndex];
    element?.focus({ preventScroll: true });
    element?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);
  const activate = useUIStore((s) => s.activateActiveMenuSelection);
  return (
    <div className="game-ui menu-surface menu-home pause-menu fixed inset-0 z-50">
      <section
        onKeyDown={trapMenuFocus}
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        className="menu-home-content"
      >
        <div className="menu-action-list menu-panel-frame">
          <header className="pause-menu-heading">
            <h2 id={headingId}>Game menu</h2>
            <span className="pause-menu-live">Live session</span>
          </header>
          {PAUSE_MENU_ITEMS.map((item, index) => (
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
              className="menu-row menu-action"
            >
              <MenuIcon name={item.id} />
              {item.label}
            </GameButton>
          ))}
        </div>
        <footer className="menu-home-shortcuts">
          <MenuShortcuts tabs={false} />
        </footer>
      </section>
    </div>
  );
}
