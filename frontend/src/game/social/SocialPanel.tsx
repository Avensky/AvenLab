import { useCallback, useEffect, useRef, useState } from "react";
import { useSocialStore } from "../../store/social/socialStore";
import { useUIStore } from "../../store/menus/uiStore";
import {
  useTextKeyboardStore,
  type KeyboardAssist,
} from "../../store/text/keyboardStore";
import { requestSocial, identifySocial } from "../../net/socialClient";
import { AssistedInput } from "../../components/text/AssistedInput";
import { MenuShortcuts } from "../../components/controller";
import { trapMenuFocus } from "../../components/menus/menuFocus";
import { WorldsPage } from "./WorldsPage";
import { TeammatesPage, GroupsPage } from "./PeoplePages";
import { InvitationsPage } from "./InvitationsPage";
import { useFormNavigation } from "./useFormNavigation";
import "./social.css";

const TABS = ["WORLDS", "TEAMMATES", "GROUPS", "INVITES", "PROFILE"] as const;

function ProfilePage({
  name,
  code,
  available,
  onSave,
  onRetry,
  onNew,
}: {
  name: string;
  code?: string;
  available: boolean;
  onSave: (name: string) => void;
  onRetry: () => void;
  onNew: (name: string) => void;
}) {
  const [draft, setDraft] = useState(name),
    [confirmNew, setConfirmNew] = useState(false);
  const mode = useTextKeyboardStore((s) => s.mode);
  return (
    <div className="social-grid">
      <section className="social-card">
        <h2>YOUR PLAYER PROFILE</h2>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            onSave(draft);
          }}
        >
          <AssistedInput
            label="PLAYER NAME"
            value={draft}
            onChange={setDraft}
            maxLength={24}
          />
          <button type="submit" className="menu-control" disabled={!available}>
            SAVE PLAYER NAME
          </button>
        </form>
        {code && (
          <>
            <p>YOUR PLAYER CODE</p>
            <p className="social-code">{code}</p>
            <p className="social-hint">
              Give this code to a teammate so they can send you a request.
            </p>
          </>
        )}
        {!code && (
          <button
            type="button"
            className="menu-control"
            disabled={!available}
            onClick={onRetry}
          >
            RETRY SAVED PROFILE
          </button>
        )}
        {!code &&
          (confirmNew ? (
            <>
              <p className="social-hint">
                Create a fresh profile on this server? This replaces the
                unavailable profile key saved on this device.
              </p>
              <button
                type="button"
                className="menu-control"
                onClick={() => {
                  onNew(draft);
                  setConfirmNew(false);
                }}
              >
                CONFIRM NEW PROFILE
              </button>
              <button
                type="button"
                className="menu-control"
                onClick={() => setConfirmNew(false)}
              >
                CANCEL
              </button>
            </>
          ) : (
            <button
              type="button"
              className="menu-control"
              disabled={!available}
              onClick={() => setConfirmNew(true)}
            >
              NEW DEVICE PROFILE
            </button>
          ))}
      </section>
      <section className="social-card">
        <h2>TEXT ENTRY</h2>
        <label>
          KEYBOARD ASSIST
          <select
            aria-label="KEYBOARD ASSIST"
            value={mode}
            onChange={(event) =>
              useTextKeyboardStore
                .getState()
                .setMode(event.currentTarget.value as KeyboardAssist)
            }
          >
            <option value="auto">AUTO</option>
            <option value="on">ON</option>
            <option value="off">OFF</option>
          </select>
        </label>
        <p className="social-hint">
          Auto offers an on-screen keyboard until you type with a physical
          keyboard. The KEYBOARD button is always available for controller
          entry.
        </p>
        <p className="social-hint">
          Your profile and groups are saved on this server. Your device keeps
          its private sign-in key. Passwords you enter here are not saved in
          your browser.
        </p>
      </section>
    </div>
  );
}

export function SocialPanel() {
  const view = useSocialStore((s) => s.view),
    available = useSocialStore((s) => s.available),
    connectionMessage = useSocialStore((s) => s.message);
  const [tab, setTab] = useState<(typeof TABS)[number]>("WORLDS"),
    [status, setStatus] = useState(""),
    [busy, setBusy] = useState(false);
  const root = useRef<HTMLElement>(null);
  const inFlight = useRef(false);
  const back = useCallback(() => useUIStore.getState().backToParentMenu(), []);
  const cycle = useCallback(
    (direction: number) =>
      setTab(
        (current) =>
          TABS[(TABS.indexOf(current) + direction + TABS.length) % TABS.length],
      ),
    [],
  );
  useFormNavigation(root, back, cycle);
  useEffect(() => {
    root.current
      ?.querySelector<HTMLElement>(`[data-social-tab="${tab}"]`)
      ?.focus({ preventScroll: true });
  }, [tab]);
  const run = async (
    task: () => Promise<Record<string, unknown> | void>,
    success: string,
  ) => {
    if (inFlight.current) return null;
    inFlight.current = true;
    setBusy(true);
    setStatus("WORKING…");
    try {
      const result = await task();
      setStatus(
        typeof result?.invited === "number"
          ? `${result.invited} WORLD INVITATION(S) SENT`
          : success,
      );
      return result ?? {};
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "The request failed.");
      return null;
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };
  const command = (
    action: string,
    fields: Record<string, unknown> = {},
    success = "Saved",
  ) => run(() => requestSocial(action, fields), success);
  const incoming = view
    ? view.requests.filter((request) => request.incoming).length +
      view.groups.filter((group) => !group.joined).length +
      view.world_invites.length
    : 0;
  return (
    <div className="game-ui menu-surface social-overlay">
      <section
        ref={root}
        role="dialog"
        aria-modal="true"
        aria-labelledby="social-title"
        data-controller-form
        className="social-panel"
        onKeyDown={trapMenuFocus}
      >
        <header className="social-header">
          <h1 id="social-title">WORLDS & SOCIAL</h1>
          <span>{view?.profile.name ?? "PLAYER PROFILE"}</span>
          <button type="button" className="menu-control" onClick={back}>
            B BACK
          </button>
        </header>
        {view && (
          <p className="social-server-budget">
            {view.limits.active_worlds}/{view.limits.max_active_worlds} ACTIVE
            WORLDS · {view.limits.active_players}/{view.limits.max_players}{" "}
            ACTIVE PLAYERS
          </p>
        )}
        <nav
          className="social-tabs"
          role="tablist"
          aria-label="Worlds and social sections"
        >
          {TABS.map((value) => (
            <button
              type="button"
              role="tab"
              aria-selected={tab === value}
              data-social-tab={value}
              className="menu-control"
              key={value}
              onClick={() => setTab(value)}
            >
              {value}
              {value === "INVITES" && incoming > 0 ? ` (${incoming})` : ""}
            </button>
          ))}
        </nav>
        <div className="social-scroll">
          <fieldset disabled={busy} className="social-body" aria-busy={busy}>
            {view && tab === "WORLDS" && (
              <WorldsPage view={view} command={command} onStatus={setStatus} />
            )}
            {view && tab === "TEAMMATES" && (
              <TeammatesPage view={view} command={command} />
            )}
            {view && tab === "GROUPS" && (
              <GroupsPage view={view} command={command} />
            )}
            {view && tab === "INVITES" && (
              <InvitationsPage view={view} command={command} />
            )}
            {(!view || tab === "PROFILE") && (
              <ProfilePage
                key={view?.profile.id ?? "unavailable"}
                name={view?.profile.name ?? "DRIVER"}
                code={view?.profile.id}
                available={available}
                onSave={(name) =>
                  void (view
                    ? command("rename", { name }, "Player name saved")
                    : run(() => identifySocial(name), "Player profile ready"))
                }
                onRetry={() =>
                  void run(() => identifySocial(), "Player profile restored")
                }
                onNew={(name) =>
                  void run(
                    () => identifySocial(name, true),
                    "New player profile created",
                  )
                }
              />
            )}
          </fieldset>
        </div>
        <footer className="social-footer">
          <MenuShortcuts />
          <p role="status">{status || connectionMessage}</p>
          <button
            type="button"
            className="menu-control"
            disabled={busy || !available}
            onClick={() => void command("refresh", {}, "Refreshed")}
          >
            REFRESH
          </button>
        </footer>
      </section>
    </div>
  );
}
