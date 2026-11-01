import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ControllerButton } from "../../components/controller";
import { AssistedInput } from "../../components/text/AssistedInput";
import { useChatStore, type ChatChannel } from "../../store/chat/chatStore";
import { usePresenceStore } from "../../store/chat/presenceStore";
import { useNetworkStore } from "../../store/session/networkStore";
import { useTextKeyboardStore } from "../../store/text/keyboardStore";
import { loadChatHistory, sendChat } from "../../net/chatClient";
import "./lobbyChat.css";
const EMPTY: never[] = [];

/** One real transport and a bounded local presence timeline. Idle means a
 * launcher only; live messages/notices open briefly without taking input focus. */
export function LobbyChat({ driving = false }: { driving?: boolean }) {
  const profile = useChatStore((s) => s.profile),
    team = useChatStore((s) => s.teamContext);
  const connected = useNetworkStore((s) => s.connected),
    activity = useChatStore((s) => s.activity);
  const events = usePresenceStore((s) => s.events),
    presenceActivity = usePresenceStore((s) => s.activity);
  const [channel, setChannel] = useState<ChatChannel>("lobby");
  const effective = channel === "team" && !team ? "lobby" : channel;
  const context = effective === "team" ? team! : "lobby";
  const lines = useChatStore((s) => s.history[context] ?? EMPTY);
  const [expanded, setExpanded] = useState(false),
    [draft, setDraft] = useState("");
  const [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [interaction, setInteraction] = useState(0);
  const composing = useTextKeyboardStore(
    (s) => s.session?.label === "Chat message",
  );
  const root = useRef<HTMLElement>(null),
    log = useRef<HTMLDivElement>(null),
    sending = useRef(false);
  const focusFrame = useRef<number | null>(null),
    returnFocus = useRef<HTMLElement | null>(null);
  const seen = useRef({ message: activity, presence: presenceActivity });
  const histories = useRef(new Set<string>()),
    loading = useRef(new Set<string>());
  const wake = useCallback(() => setInteraction((value) => value + 1), []);
  const close = useCallback(() => {
    if (focusFrame.current !== null)
      window.cancelAnimationFrame(focusFrame.current);
    focusFrame.current = null;
    if (root.current?.contains(document.activeElement)) {
      (document.activeElement as HTMLElement)?.blur();
      if (returnFocus.current?.isConnected)
        returnFocus.current.focus({ preventScroll: true });
    }
    setExpanded(false);
  }, []);
  const open = useCallback(() => {
    const active = document.activeElement;
    returnFocus.current =
      active instanceof HTMLElement && !root.current?.contains(active)
        ? active
        : null;
    setExpanded(true);
    wake();
    if (focusFrame.current !== null)
      window.cancelAnimationFrame(focusFrame.current);
    focusFrame.current = window.requestAnimationFrame(() => {
      focusFrame.current = null;
      const input = root.current?.querySelector<HTMLInputElement>(
        "input:not(:disabled)",
      );
      if (input) {
        input.focus({ preventScroll: true });
        input.click();
      } else
        root.current
          ?.querySelector<HTMLButtonElement>(".chat-focus")
          ?.focus({ preventScroll: true });
    });
  }, [wake]);
  useEffect(
    () => () => {
      if (focusFrame.current !== null)
        window.cancelAnimationFrame(focusFrame.current);
    },
    [],
  );
  useEffect(() => {
    histories.current.clear();
    loading.current.clear();
    setDraft("");
    close();
  }, [profile, team, close]);
  useEffect(() => {
    const freshMessage =
      activity &&
      activity !== seen.current.message &&
      activity.author !== profile;
    const freshEvent = presenceActivity > seen.current.presence;
    seen.current = { message: activity, presence: presenceActivity };
    if (freshMessage || freshEvent) {
      if (freshMessage) setChannel(activity.channel);
      setExpanded(true);
      wake();
    }
  }, [activity, presenceActivity, profile, wake]);
  useEffect(() => {
    if (!expanded || draft.trim() || busy || composing) return;
    const timer = window.setTimeout(close, 6000);
    return () => window.clearTimeout(timer);
  }, [expanded, interaction, draft, busy, composing, close]);
  useEffect(() => {
    const key = `${profile}:${context}`;
    if (
      !connected ||
      !profile ||
      !expanded ||
      histories.current.has(key) ||
      loading.current.has(key)
    )
      return;
    let cancelled = false;
    loading.current.add(key);
    void loadChatHistory(effective)
      .then(() => histories.current.add(key))
      .catch((error) => {
        if (!cancelled) setNotice((error as Error).message);
      })
      .finally(() => loading.current.delete(key));
    return () => {
      cancelled = true;
    };
  }, [connected, profile, expanded, context, effective]);
  const timeline = useMemo(
    () =>
      [
        ...lines.map((line) => ({
          id: `chat:${line.id}`,
          name: line.name,
          text: line.text,
          time: line.sent_at,
          system: false,
        })),
        ...events.map((event) => ({
          id: `event:${event.id}`,
          name: "WORLD",
          text: event.text,
          time: event.sent_at,
          system: true,
        })),
      ]
        .sort((a, b) => a.time - b.time)
        .slice(-50),
    [lines, events],
  );
  useEffect(() => {
    if (log.current) log.current.scrollTop = log.current.scrollHeight;
  }, [timeline, expanded]);
  useEffect(() => {
    const toggle = () => {
      if (expanded) close();
      else open();
    };
    const key = (event: KeyboardEvent) => {
      if (
        event.code !== (driving ? "Enter" : "KeyT") ||
        event.defaultPrevented ||
        event.repeat ||
        event.ctrlKey ||
        event.altKey ||
        event.metaKey ||
        useTextKeyboardStore.getState().session ||
        (event.target as HTMLElement)?.closest(
          "input,textarea,select,[contenteditable=true]",
        )
      )
        return;
      event.preventDefault();
      event.stopPropagation();
      open();
    };
    window.addEventListener("avenlab:chat-toggle", toggle);
    window.addEventListener("avenlab:chat-close", close);
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("avenlab:chat-toggle", toggle);
      window.removeEventListener("avenlab:chat-close", close);
      window.removeEventListener("keydown", key);
    };
  }, [expanded, close, open, driving]);
  const send = async () => {
    const text = draft.trim();
    if (!text || !connected || !profile || sending.current) return;
    sending.current = true;
    setBusy(true);
    setNotice("");
    try {
      await sendChat(effective, text);
      setDraft("");
    } catch (error) {
      setNotice((error as Error).message);
    } finally {
      sending.current = false;
      setBusy(false);
      wake();
    }
  };
  return (
    <section
      className="lobby-chat"
      ref={root}
      aria-label="Lobby and team chat"
      data-expanded={expanded}
      onPointerDownCapture={wake}
      onKeyDownCapture={wake}
      onFocusCapture={wake}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          close();
        }
      }}
    >
      {!expanded ? (
        <button
          type="button"
          className="chat-launcher"
          aria-label="Open chat"
          aria-expanded={false}
          onClick={open}
        >
          {driving ? (
            <>
              <ControllerButton button="RB" />
              <ControllerButton button="VIEW" />
            </>
          ) : (
            <ControllerButton button="X" />
          )}{" "}
          CHAT
        </button>
      ) : (
        <>
          <header>
            <button type="button" className="chat-focus" onClick={open}>
              CHAT <kbd>{driving ? "ENTER" : "T"}</kbd>
            </button>
            <nav aria-label="Chat channel">
              <button
                type="button"
                aria-pressed={effective === "lobby"}
                onClick={() => {
                  setChannel("lobby");
                  setNotice("");
                }}
              >
                LOBBY
              </button>
              <button
                type="button"
                aria-pressed={effective === "team"}
                disabled={!team}
                title={
                  team
                    ? "Your current world team"
                    : "Join a world for Team chat"
                }
                onClick={() => {
                  setChannel("team");
                  setNotice("");
                }}
              >
                TEAM
              </button>
            </nav>
            <button
              type="button"
              className="chat-collapse"
              aria-label="Minimize chat"
              aria-expanded={true}
              onClick={close}
            >
              −
            </button>
          </header>
          <div
            className="chat-lines"
            ref={log}
            role="log"
            aria-label={`${effective === "team" ? "Team" : "Lobby"} messages`}
            aria-live="polite"
            aria-relevant="additions"
          >
            {!timeline.length && (
              <p className="chat-empty">
                {!connected || !profile
                  ? "CONNECT TO USE CHAT"
                  : "NO RECENT MESSAGES"}
              </p>
            )}
            {timeline.map((line) => (
              <p
                key={line.id}
                className={line.system ? "chat-system" : undefined}
              >
                <strong>{line.name}</strong>
                <span>{line.text}</span>
              </p>
            ))}
          </div>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void send();
            }}
          >
            <AssistedInput
              label="Chat message"
              value={draft}
              maxLength={280}
              autoComplete="off"
              placeholder={
                effective === "team"
                  ? "Message your team…"
                  : "Message the lobby…"
              }
              onChange={setDraft}
              disabled={!connected || !profile || busy}
            />
            <button
              type="submit"
              className="chat-send"
              disabled={!connected || !profile || busy || !draft.trim()}
            >
              {busy ? "…" : "SEND"}
            </button>
          </form>
          {notice && (
            <p className="chat-notice" role="status">
              {notice}
            </p>
          )}
        </>
      )}
    </section>
  );
}
