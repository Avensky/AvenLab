import { useCallback, useRef, useState } from "react";
import { MenuVideoBackground } from "../../components/menus/MenuVideoBackground";
import { ControllerButton, MenuShortcuts } from "../../components/controller";
import { useSocialStore } from "../../store/social/socialStore";
import { useNetworkStore } from "../../store/session/networkStore";
import { useUIStore } from "../../store/menus/uiStore";
import { requestSocial } from "../../net/socialClient";
import { useFormNavigation } from "../social/useFormNavigation";
import { joinSelectedMode } from "./sessionActions";
import { GAME_MODES } from "../../store/alpha/alphaStore";
import "./alpha.css";
export function QueueScreen() {
  const queue = useSocialStore((s) => s.view?.alpha?.queue),
    connected = useNetworkStore((s) => s.connected);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const pending = useRef(false);
  const root = useRef<HTMLElement>(null);
  const cancel = useCallback(() => {
    if (pending.current) return;
    if (!useNetworkStore.getState().connected) {
      useUIStore.getState().setScreen("main");
      return;
    }
    pending.current = true;
    setBusy(true);
    void requestSocial("mode_cancel")
      .then(() => useUIStore.getState().setScreen("main"))
      .catch((reason) => setError((reason as Error).message))
      .finally(() => {
        pending.current = false;
        setBusy(false);
      });
  }, []);
  const retry = async () => {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      await joinSelectedMode();
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  useFormNavigation(root, cancel, () => {});
  return (
    <main
      ref={root}
      className="game-ui menu-surface alpha-queue"
      data-controller-form
    >
      <MenuVideoBackground loading cycle />
      <section className="alpha-queue-card" aria-label="Alpha waiting line">
        <small>REDLINE VECTOR · LIMITED ALPHA</small>
        <h1>YOU’RE IN LINE</h1>
        <h2>
          {GAME_MODES.find((m) => m.id === queue?.mode)?.label ??
            (connected ? "REJOIN AVAILABLE" : "RECONNECTING")}
        </h2>
        <strong className="alpha-queue-position" aria-live="polite">
          {connected && queue ? `#${queue.position}` : "—"}
        </strong>
        <p>
          {connected && queue
            ? `${queue.size} PLAYER(S) WAITING FOR THIS SLOT`
            : connected
              ? "YOUR PREVIOUS WAITING TICKET ENDED"
              : "RECONNECTING TO THE SERVER…"}
        </p>
        <p>
          {queue?.reason ??
            (connected
              ? "Rejoin the queue for a new position."
              : "The waiting line will refresh when the connection returns.")}
        </p>
        <p className="alpha-queue-note">
          ONE 5v5 MATCH · ONE LIVE EDITOR · ONE SOLO WORLD
          <br />A disconnected player has a short reconnect window before their
          seat opens. Your position updates automatically when a seat opens.
        </p>
        {error && <p role="status">{error}</p>}
        {connected && !queue && (
          <button
            type="button"
            className="menu-control"
            disabled={busy}
            onClick={() => void retry()}
          >
            REJOIN QUEUE
          </button>
        )}
        <button
          type="button"
          className="menu-control"
          disabled={busy}
          onClick={cancel}
        >
          <ControllerButton button="B" /> LEAVE QUEUE
        </button>
        <MenuShortcuts tabs={false} />
      </section>
    </main>
  );
}
