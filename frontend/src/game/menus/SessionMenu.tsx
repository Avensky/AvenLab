import { useCallback, useEffect, useId, useRef, useState } from "react";
import { trapMenuFocus } from "../../components/menus/menuFocus";
import { connectRustServer, disconnectRustServer } from "../../net/rustSocket";
import { requestSocial } from "../../net/socialClient";
import { useSocialStore } from "../../store/social/socialStore";
import { useUIStore } from "../../store/menus/uiStore";
import type { MenuAction } from "../../controls/inputRouting";

export function SessionMenu() {
  const [selected, setSelected] = useState<"confirm" | "cancel">("cancel");
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  const id = useId();
  const pending = useRef(false);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const cancel = useUIStore((s) => s.backToParentMenu);
  const confirm = useCallback(() => {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    void (async () => {
      try {
        // Explicit leave releases the seat before reconnect; a network drop
        // instead receives the server's reconnect reservation.
        if (useSocialStore.getState().available)
          await requestSocial("mode_cancel");
        disconnectRustServer();
        useUIStore.getState().setScreen("main");
        connectRustServer();
      } catch (reason) {
        setError((reason as Error).message);
      } finally {
        pending.current = false;
        setBusy(false);
      }
    })();
  }, []);
  useEffect(() => {
    buttons.current.get(selected)?.focus({ preventScroll: true });
  }, [selected]);
  useEffect(() => {
    const handle = (event: Event) => {
      if (pending.current) return;
      const action = (event as CustomEvent<MenuAction>).detail;
      if (action === "back") cancel();
      else if (action === "left") setSelected("confirm");
      else if (action === "right") setSelected("cancel");
      else if (action === "up" || action === "down")
        setSelected((value) => (value === "confirm" ? "cancel" : "confirm"));
      else if (action === "activate") {
        if (selected === "confirm") confirm();
        else cancel();
      }
    };
    window.addEventListener("avenlab:panel-action", handle);
    return () => window.removeEventListener("avenlab:panel-action", handle);
  }, [cancel, confirm, selected]);

  return (
    <div className="game-ui menu-surface menu-confirm-overlay fixed inset-0 z-50">
      <section
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={`${id}-title`}
        aria-describedby={`${id}-message`}
        onKeyDown={trapMenuFocus}
        className="menu-confirm-card"
      >
        <header>
          <h1 id={`${id}-title`}>LEAVE GAME?</h1>
        </header>
        <div className="menu-confirm-body">
          <p id={`${id}-message`}>Are you sure you want to leave game?</p>
          {error && <p role="status">{error}</p>}
        </div>
        <nav className="menu-confirm-actions" aria-label="Leave game actions">
          {(["confirm", "cancel"] as const).map((action) => (
            <button
              key={action}
              disabled={busy}
              type="button"
              ref={(element) => {
                if (element) buttons.current.set(action, element);
                else buttons.current.delete(action);
              }}
              data-menu-row={action}
              data-selected={selected === action}
              className="menu-control menu-action"
              onFocus={() => setSelected(action)}
              onPointerEnter={() => setSelected(action)}
              onClick={action === "confirm" ? confirm : cancel}
              onKeyDown={(event) => {
                if (event.code === "Enter" || event.code === "Space") {
                  event.preventDefault();
                  event.stopPropagation();
                  if (!event.repeat) {
                    if (action === "confirm") confirm();
                    else cancel();
                  }
                }
              }}
            >
              {action.toUpperCase()}
            </button>
          ))}
        </nav>
      </section>
    </div>
  );
}
