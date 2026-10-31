import { useEffect, useRef, useState } from "react";
import { trapMenuFocus } from "../menus/menuFocus";
import { useTextKeyboardStore } from "../../store/text/keyboardStore";
import type { MenuAction } from "../../controls/inputRouting";
import "./textKeyboard.css";

const LETTERS = ["QWERTYUIOP", "ASDFGHJKL", "ZXCVBNM"].map((row) =>
  row.split(""),
);
const SYMBOLS = ["1234567890", "!@#$%&*()-", "_+=?/.:,;"].map((row) =>
  row.split(""),
);

function KeyboardDialog() {
  const session = useTextKeyboardStore((s) => s.session)!;
  const [upper, setUpper] = useState(true),
    [symbols, setSymbols] = useState(false);
  const [position, setPosition] = useState([0, 0]);
  const root = useRef<HTMLElement>(null);
  const rows = [
    ...(symbols ? SYMBOLS : LETTERS),
    ["SHIFT", "123", "SPACE", "DELETE", "DONE"],
  ];
  const action = useRef<(action: MenuAction) => void>(() => {});
  const toggleSymbols = () => {
    setSymbols((value) => !value);
    setPosition([0, 0]);
  };
  const press = (key: string) => {
    const store = useTextKeyboardStore.getState();
    const value = store.session?.value ?? "";
    if (key === "SHIFT") setUpper((value) => !value);
    else if (key === "123") toggleSymbols();
    else if (key === "DONE") store.close();
    else if (key === "DELETE")
      store.edit(Array.from(value).slice(0, -1).join(""));
    else
      store.edit(
        value + (key === "SPACE" ? " " : upper ? key : key.toLowerCase()),
      );
  };
  useEffect(() => {
    action.current = (event) => {
      if (event === "back") {
        useTextKeyboardStore.getState().close(true);
        return;
      }
      if (event === "previous_tab" || event === "next_tab") {
        toggleSymbols();
        return;
      }
      if (event === "activate") {
        press(rows[position[0]][position[1]]);
        return;
      }
      setPosition(([row, col]) => {
        if (event === "left" || event === "right")
          return [
            row,
            (col + (event === "left" ? -1 : 1) + rows[row].length) %
              rows[row].length,
          ];
        const next =
          (row + (event === "up" ? -1 : 1) + rows.length) % rows.length;
        return [
          next,
          Math.min(
            rows[next].length - 1,
            Math.round(
              (col * (rows[next].length - 1)) /
                Math.max(1, rows[row].length - 1),
            ),
          ),
        ];
      });
    };
  });
  useEffect(() => {
    const handle = (event: Event) =>
      action.current((event as CustomEvent<MenuAction>).detail);
    window.addEventListener("avenlab:keyboard-action", handle);
    return () => window.removeEventListener("avenlab:keyboard-action", handle);
  }, []);
  useEffect(() => {
    root.current
      ?.querySelector<HTMLElement>(`[data-key="${position.join("-")}"]`)
      ?.focus({ preventScroll: true });
  }, [position]);
  return (
    <div className="text-keyboard-overlay menu-surface">
      <section
        ref={root}
        role="dialog"
        aria-modal="true"
        aria-label={`Keyboard: ${session.label}`}
        className="text-keyboard"
        onKeyDown={(event) => {
          trapMenuFocus(event);
          const direction = (
            {
              ArrowUp: "up",
              ArrowDown: "down",
              ArrowLeft: "left",
              ArrowRight: "right",
              Escape: "back",
            } as const
          )[event.key as "ArrowUp"];
          if (direction) {
            event.preventDefault();
            event.stopPropagation();
            action.current(direction);
          }
        }}
      >
        <header>
          <strong>{session.label}</strong>
          <button
            type="button"
            className="menu-control"
            onClick={() => useTextKeyboardStore.getState().close(true)}
          >
            B CANCEL
          </button>
        </header>
        <output
          className="text-keyboard-preview"
          aria-label={session.secret ? "Masked password" : "Entered text"}
        >
          {session.secret
            ? "•".repeat(session.value.length)
            : session.value || " "}
        </output>
        <div className="text-keyboard-rows">
          {rows.map((row, r) => (
            <div
              className="text-keyboard-row"
              key={r}
              style={{
                gridTemplateColumns: `repeat(${row.length},minmax(0,1fr))`,
              }}
            >
              {row.map((key, c) => (
                <button
                  type="button"
                  key={key}
                  className="menu-control"
                  data-key={`${r}-${c}`}
                  data-selected={position[0] === r && position[1] === c}
                  aria-label={
                    key.length === 1
                      ? `Type ${upper ? key : key.toLowerCase()}`
                      : key
                  }
                  onPointerEnter={() => setPosition([r, c])}
                  onFocus={() => {
                    if (position[0] !== r || position[1] !== c)
                      setPosition([r, c]);
                  }}
                  onClick={() => press(key)}
                >
                  {key.length === 1 && !upper ? key.toLowerCase() : key}
                </button>
              ))}
            </div>
          ))}
        </div>
        <small>
          D-PAD MOVE · A TYPE · B CANCEL · LB / RB LETTERS & NUMBERS
        </small>
      </section>
    </div>
  );
}

export function OnScreenKeyboard() {
  const active = useTextKeyboardStore((s) => Boolean(s.session));
  useEffect(() => {
    const physical = (event: KeyboardEvent) => {
      if (
        !event.isTrusted ||
        event.ctrlKey ||
        event.altKey ||
        event.metaKey ||
        event.isComposing ||
        !event.code
      )
        return;
      const text = event.key.length === 1,
        erase = event.key === "Backspace";
      if (!text && !erase) return;
      const store = useTextKeyboardStore.getState();
      if (!store.hardwareObserved)
        useTextKeyboardStore.setState({ hardwareObserved: true });
      if (!store.session) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      store.edit(
        erase
          ? Array.from(store.session.value).slice(0, -1).join("")
          : store.session.value + event.key,
      );
      if (store.mode === "auto") store.close();
    };
    const hidden = () => {
      if (document.visibilityState === "hidden")
        useTextKeyboardStore.getState().close();
    };
    window.addEventListener("keydown", physical, true);
    document.addEventListener("visibilitychange", hidden);
    return () => {
      window.removeEventListener("keydown", physical, true);
      document.removeEventListener("visibilitychange", hidden);
    };
  }, []);
  return active ? <KeyboardDialog /> : null;
}
