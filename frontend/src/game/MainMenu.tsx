import { useUIStore } from "../store";
import { GameButton } from "../components/GameButton";
import { useEffect, useRef } from "react";
import { MenuLogo } from "../components/menus/MenuLogo";
import { MenuVideoBackground } from "../components/menus/MenuVideoBackground";

import { MAIN_MENU_ITEMS } from "./menuItems";

export function MainMenu() {
  const selectedIndex = useUIStore((s) => s.selectedMenuIndexById.main);
  const setActiveMenuIndex = useUIStore((s) => s.setActiveMenuIndex);
  const activate = useUIStore((s) => s.activateActiveMenuSelection);

  const itemRefs = useRef<Array<HTMLDivElement | null>>([]);

  useEffect(() => {
    const el = itemRefs.current[selectedIndex];
    if (!el) return;

    el.focus({ preventScroll: true });
    el.scrollIntoView({
      block: "nearest",
      inline: "nearest",
      behavior: "auto",
    });
  }, [selectedIndex]);

  return (
    <div className="game-ui menu-surface menu-home main-menu relative z-30">
      <MenuVideoBackground />
      <div className="menu-home-content">
        <header className="menu-brand menu-brand-main">
          <MenuLogo />
          <div className="menu-brand-copy">
            <p className="menu-brand-eyebrow">
              CYBERSECURITY SCIENCE &amp; TECHNOLOGY
            </p>

            <h1 className="menu-brand-title">
              REDLINE VECTOR
            </h1>

            <p className="menu-brand-tagline">
              Land. Air. Sea. Signal.
            </p>
          </div>
        </header>

        <div className="menu-action-list">
          {MAIN_MENU_ITEMS.map((item, index) => (
            <GameButton
              key={item.id}
              ref={(el) => {
                itemRefs.current[index] = el;
              }}
              selected={selectedIndex === index}
              variant="menu"
              aria-disabled={!item.available}
              onPress={() => { setActiveMenuIndex(index); activate(); }}
              onFocus={() => setActiveMenuIndex(index)}
              className="menu-row menu-action"
            >
              {item.label}
              {!item.available && <span className="menu-control-note">Planned</span>}
            </GameButton>
          ))}
        </div>
      </div>
    </div>
  );
}
