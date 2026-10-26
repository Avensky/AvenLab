import { trapMenuFocus } from "../components/menus/menuFocus";
import { useEffect, useRef } from "react";
import { useUIStore } from "../store/uiStore";
import { GameButton } from "../components/GameButton";
import { PAUSE_MENU_ITEMS } from "./menuItems";
import { MenuLogo } from "../components/menus/MenuLogo";

export function PauseMenu() {
  const selectedIndex = useUIStore((s) => s.selectedMenuIndexById.pause);
  const setIndex = useUIStore((s) => s.setActiveMenuIndex);
  const buttons = useRef<Array<HTMLDivElement | null>>([]);
  useEffect(() => {
    const element = buttons.current[selectedIndex];
    element?.focus({ preventScroll: true });
    element?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);
  const activate = useUIStore((s) => s.activateActiveMenuSelection);
  return <div className="game-ui menu-surface menu-home pause-menu fixed inset-0 z-50">
    <section onKeyDown={trapMenuFocus} role="dialog" aria-modal="true" aria-label="Pause menu" className="menu-home-content">
      <div className="menu-brand"><MenuLogo /></div>
      <div className="menu-action-list">
        {PAUSE_MENU_ITEMS.map((item, index) => <GameButton key={item.id} ref={(element) => { buttons.current[index] = element; }} selected={selectedIndex === index}
          variant="menu" onFocus={() => setIndex(index)}
          onPress={() => { setIndex(index); activate(); }} className="menu-row menu-action">
          {item.label}
        </GameButton>)}
      </div>
    </section>
  </div>;
}
