import { useCallback, useEffect, useId, useRef, useState } from "react";
import { trapMenuFocus } from "../components/menus/menuFocus";
import { connectRustServer, disconnectRustServer } from "../net/rustSocket";
import { useUIStore } from "../store/uiStore";
import type { MenuAction } from "../store/tools/inputRouting";

export function SessionMenu() {
  const [selected, setSelected] = useState<"confirm" | "cancel">("cancel");
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  const id = useId();
  const cancel = useUIStore(s => s.backToParentMenu);
  const confirm = useCallback(() => {
    disconnectRustServer();
    useUIStore.getState().setScreen("main");
    connectRustServer();
  }, []);
  useEffect(() => { buttons.current.get(selected)?.focus({ preventScroll: true }); }, [selected]);
  useEffect(() => {
    const handle = (event: Event) => {
      const action = (event as CustomEvent<MenuAction>).detail;
      if (action === "back") cancel();
      else if (action === "left") setSelected("confirm");
      else if (action === "right") setSelected("cancel");
      else if (action === "up" || action === "down") setSelected(value => value === "confirm" ? "cancel" : "confirm");
      else if (action === "activate") { if (selected === "confirm") confirm(); else cancel(); }
    };
    window.addEventListener("avenlab:panel-action", handle);
    return () => window.removeEventListener("avenlab:panel-action", handle);
  }, [cancel, confirm, selected]);

  return <div className="game-ui menu-surface menu-confirm-overlay fixed inset-0 z-50">
    <section role="alertdialog" aria-modal="true" aria-labelledby={`${id}-title`} aria-describedby={`${id}-message`}
      onKeyDown={trapMenuFocus} className="menu-confirm-card">
      <header><h1 id={`${id}-title`}>LEAVE GAME?</h1></header>
      <div className="menu-confirm-body"><p id={`${id}-message`}>Are you sure you want to leave game?</p></div>
      <nav className="menu-confirm-actions" aria-label="Leave game actions">
        {(["confirm", "cancel"] as const).map(action => <button key={action} type="button"
          ref={element => { if (element) buttons.current.set(action, element); else buttons.current.delete(action); }}
          data-menu-row={action} data-selected={selected === action} className="menu-control menu-action"
          onFocus={() => setSelected(action)} onPointerEnter={() => setSelected(action)}
          onClick={action === "confirm" ? confirm : cancel}
          onKeyDown={event => {
            if (event.code === "Enter" || event.code === "Space") {
              event.preventDefault(); event.stopPropagation();
              if (!event.repeat) { if (action === "confirm") confirm(); else cancel(); }
            }
          }}>{action.toUpperCase()}</button>)}
      </nav>
    </section>
  </div>;
}
