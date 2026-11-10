import { useCallback, useEffect, useId, useRef, useState } from "react";
import { ControllerAction } from "../../components/controller";
import { connectRustServer, disconnectRustServer } from "../../net/rustSocket";
import { requestSocial } from "../../net/socialClient";
import { useSocialStore } from "../../store/social/socialStore";
import { useUIStore } from "../../store/menus/uiStore";
import type { MenuAction } from "../../controls/inputRouting";

export function SessionMenu() {
  const dialog = useRef<HTMLElement>(null);
  const id = useId();
  const pending = useRef(false);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const cancel = useCallback(() => {
    if (!pending.current) useUIStore.getState().backToParentMenu();
  }, []);
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
    dialog.current?.focus({ preventScroll: true });
  }, []);
  useEffect(() => {
    const handle = (event: Event) => {
      if (pending.current) return;
      const action = (event as CustomEvent<MenuAction>).detail;
      if (action === "back") cancel();
      else if (action === "activate") confirm();
    };
    window.addEventListener("avenlab:panel-action", handle);
    return () => window.removeEventListener("avenlab:panel-action", handle);
  }, [cancel, confirm]);

  return (
    <div className="game-ui menu-surface menu-confirm-overlay fixed inset-0 z-50">
      <section
        ref={dialog}
        role="alertdialog"
        tabIndex={-1}
        aria-modal="true"
        aria-labelledby={`${id}-title`}
        aria-describedby={`${id}-message`}
        onKeyDownCapture={(event) => {
          // This modal has two explicit shortcuts, not a movable selection.
          // Consume native button activation before the shared keyboard owner
          // so Enter/A cannot change meaning when the pointer focuses Cancel.
          const key = event.code || event.key;
          if (!["Enter", "NumpadEnter", "Space", "Escape", "Tab"].includes(key))
            return;
          event.preventDefault();
          event.stopPropagation();
          if (event.repeat || key === "Tab") return;
          if (key === "Escape") cancel();
          else confirm();
        }}
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
            <ControllerAction button={action === "confirm" ? "A" : "B"}
              key={action}
              disabled={busy}
              type="button"
              data-menu-row={action}
              className="menu-control"
              onClick={action === "confirm" ? confirm : cancel}
            >
              {action.toUpperCase()}
            </ControllerAction>
          ))}
        </nav>
      </section>
    </div>
  );
}
