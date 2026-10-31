import { useCallback, useEffect, useRef, useState } from "react";
import { AssistedInput } from "../../components/text/AssistedInput";
import { useChatStore, type ChatChannel } from "../../store/chat/chatStore";
import { useNetworkStore } from "../../store/session/networkStore";
import { useTextKeyboardStore } from "../../store/text/keyboardStore";
import { loadChatHistory, sendChat } from "../../net/chatClient";
const EMPTY: never[] = [];

/** One real socket/history owner; typing never reaches driving or hero actions. */
export function LobbyChat() {
  const profile = useChatStore((s) => s.profile),
    team = useChatStore((s) => s.teamContext);
  const connected = useNetworkStore((s) => s.connected);
  const [channel, setChannel] = useState<ChatChannel>("lobby");
  const effective = channel === "team" && !team ? "lobby" : channel;
  const context = effective === "team" ? team! : "lobby";
  const lines = useChatStore((s) => s.history[context] ?? EMPTY);
  const [expanded, setExpanded] = useState(true),
    [draft, setDraft] = useState("");
  const [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  const [awake, setAwake] = useState(false);
  const composing = useTextKeyboardStore(
    (s) => s.session?.label === "Chat message",
  );
  const idleTimer = useRef<number | null>(null);
  // No idle polling: one timer after interaction; typing and the assisted
  // keyboard keep the panel solid even when that short grace period expires.
  const wake = useCallback(() => {
    setAwake(true);
    if (idleTimer.current !== null) window.clearTimeout(idleTimer.current);
    idleTimer.current = window.setTimeout(() => {
      idleTimer.current = null;
      setAwake(false);
    }, 4000);
  }, []);
  useEffect(
    () => () => {
      if (idleTimer.current !== null) window.clearTimeout(idleTimer.current);
    },
    [],
  );
  const root = useRef<HTMLElement>(null),
    log = useRef<HTMLDivElement>(null),
    sending = useRef(false);
  useEffect(() => {
    let cancelled = false;
    if (connected && profile && expanded)
      void loadChatHistory(effective).catch((error) => {
        if (!cancelled) setNotice((error as Error).message);
      });
    return () => {
      cancelled = true;
    };
  }, [connected, profile, expanded, effective, team]);
  useEffect(() => {
    if (log.current) log.current.scrollTop = log.current.scrollHeight;
  }, [lines]);
  const focus = useCallback(() => {
    setExpanded(true);
    requestAnimationFrame(() => {
      const field = root.current?.querySelector<HTMLInputElement>("input");
      field?.focus({ preventScroll: true });
      field?.click();
    });
  }, []);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (
        event.code !== "KeyT" ||
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
      focus();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [focus]);
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
    }
  };
  return (
    <section
      className="lobby-chat"
      ref={root}
      aria-label="Lobby and team chat"
      data-expanded={expanded}
      data-active={awake || composing}
      onPointerDownCapture={wake}
      onKeyDownCapture={wake}
      onFocusCapture={wake}
    >
      <header>
        <button type="button" className="chat-focus" onClick={focus}>
          CHAT <kbd>T</kbd>
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
              team ? "Your current world team" : "Join a world for Team chat"
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
          aria-label={expanded ? "Minimize chat" : "Open chat"}
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? "−" : "+"}
        </button>
      </header>
      {expanded && (
        <>
          <div
            className="chat-lines"
            ref={log}
            role="log"
            aria-label={`${effective === "team" ? "Team" : "Lobby"} messages`}
            aria-live="polite"
            aria-relevant="additions"
          >
            {!lines.length && (
              <p className="chat-empty">
                {!connected || !profile
                  ? "CONNECT TO USE CHAT"
                  : effective === "team"
                    ? "YOUR WORLD TEAM · SAY HELLO"
                    : "LOBBY · SAY HELLO"}
              </p>
            )}
            {lines.map((line) => (
              <p key={line.id}>
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
