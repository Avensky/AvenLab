import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { MenuAction } from "../../controls/inputRouting";
import { createGuestProfile, signInDeviceProfile } from "../../net/socialClient";
import { selectEquippedCharacter, useSocialStore } from "../../store/social/socialStore";
import { openCharacterEditor } from "../../worldBuilder/characterEditor/characterEditorStore";
import { CharacterPortrait } from "../characters/CharacterPortrait";
import { DEFAULT_CHARACTER } from "../characters/characterCatalog";
import "./mainMenuProfile.css";

export function MainMenuProfile({ focusMenu }: { focusMenu: () => void }) {
  const choice = useSocialStore(selectEquippedCharacter) ?? DEFAULT_CHARACTER;
  const name = useSocialStore(state => state.view?.profile.name);
  const scope = useSocialStore(state => state.profileScope);
  const available = useSocialStore(state => state.available);
  const status = useSocialStore(state => state.profileStatus);
  const message = useSocialStore(state => state.message);
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLElement>(null);
  const panelId = useId();
  const guest = Boolean(name) && scope === "tab";
  const signedIn = Boolean(name) && !guest;
  const busy = status === "restoring";
  const caption = guest ? "Guest" : name ?? "Sign in";

  const close = useCallback(() => {
    setOpen(false);
    trigger.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    if (!open) return;
    panel.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
    function outside(event: PointerEvent) {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);

  useEffect(() => {
    function route(event: Event) {
      const action = (event as CustomEvent<MenuAction>).detail;
      const active = document.activeElement;
      if (!open) {
        if (action === "right") trigger.current?.focus({ preventScroll: true });
        else if (active === trigger.current && action === "activate") trigger.current?.click();
        else if (active === trigger.current && (action === "left" || action === "back")) focusMenu();
        else return;
      } else if (action === "back") close();
      else if (action === "activate") {
        if (active === trigger.current) close();
        else if (active instanceof HTMLElement && active.matches("button") && panel.current?.contains(active)) active.click();
        else panel.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
      } else if (["up", "down", "left", "right"].includes(action)) {
        const buttons = Array.from(panel.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? []);
        const index = buttons.findIndex(button => button === active);
        const step = action === "up" || action === "left" ? -1 : 1;
        buttons[index < 0 ? 0 : (index + step + buttons.length) % buttons.length]?.focus();
      }
      event.preventDefault();
    }
    window.addEventListener("avenlab:main-menu-action", route);
    return () => window.removeEventListener("avenlab:main-menu-action", route);
  }, [close, focusMenu, open]);

  async function connect(action: () => Promise<void>) {
    try {
      await action();
      if (root.current?.contains(document.activeElement)) close();
      else setOpen(false);
    } catch { /* The social client publishes the request error for this panel. */ }
  }

  return <header ref={root} className="main-menu-profile" onKeyDown={event => {
    if (open && event.key === "Escape") { event.preventDefault(); close(); }
  }}>
    <button ref={trigger} type="button" className="main-menu-profile-trigger menu-control menu-panel-frame"
      data-main-profile-toggle aria-label="Player profile" aria-expanded={open} aria-controls={panelId}
      title={`Player profile · ${caption}`} onClick={open ? close : () => setOpen(true)}>
      <span className="main-menu-profile-caption" aria-hidden="true">{caption}</span>
      <span className="main-menu-profile-portrait" aria-hidden="true"><CharacterPortrait choice={choice} compact /></span>
    </button>
    <section ref={panel} id={panelId} className="main-menu-profile-panel menu-panel-frame" aria-label="Player profile options" hidden={!open}>
      <h2>{signedIn ? name : guest ? "Guest session" : "Player profile"}</h2>
      <p>{signedIn ? "Your progress and outfits are saved on this device." : guest ? "Your progress and outfits stay in this tab." : "Sign in to keep your progress and outfits for later visits."}</p>
      {(status === "restoring" || status === "error") && <p role="status">{message}</p>}
      {!available && <p role="status">Connect to the game server to sign in.</p>}
      <div className="main-menu-profile-options">
        {!signedIn && <button type="button" className="menu-control menu-panel-frame" disabled={!available || busy}
          onClick={() => void connect(signInDeviceProfile)}>Sign in on this device</button>}
        {!guest && <button type="button" className="menu-control menu-panel-frame" disabled={busy}
          onClick={() => available ? void connect(createGuestProfile) : close()}>Continue as guest</button>}
        <button type="button" className="menu-control menu-panel-frame" data-open-character disabled={busy} onClick={() => {
          close();
          openCharacterEditor();
        }}>Edit character</button>
      </div>
    </section>
  </header>;
}
