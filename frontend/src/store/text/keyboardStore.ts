import { create } from "zustand";

export type KeyboardAssist = "auto" | "on" | "off";
export type TextSession = {
  id: string;
  label: string;
  value: string;
  initial: string;
  maxLength: number;
  secret: boolean;
  onChange: (value: string) => void;
  returnFocus: HTMLElement | null;
};
export function keyboardNeeded(
  mode: KeyboardAssist,
  hardwareObserved: boolean,
) {
  return mode === "on" || (mode === "auto" && !hardwareObserved);
}

/** A hardware key is evidence of a keyboard; browser pointer capabilities are
 * not. Keep a manual override because attachment/removal has no reliable API. */
const savedMode = (): KeyboardAssist => {
  try {
    const mode = localStorage.getItem("avenlab-keyboard-assist-v1");
    return mode === "on" || mode === "off" ? mode : "auto";
  } catch {
    return "auto";
  }
};
export const useTextKeyboardStore = create<{
  mode: KeyboardAssist;
  hardwareObserved: boolean;
  session: TextSession | null;
  setMode: (mode: KeyboardAssist) => void;
  open: (session: TextSession, force?: boolean) => void;
  edit: (value: string) => void;
  sync: (id: string, value: string) => void;
  close: (cancel?: boolean) => void;
}>((set, get) => ({
  mode: savedMode(),
  hardwareObserved: false,
  session: null,
  setMode: (mode) => {
    if (mode === get().mode) return;
    set({ mode });
    try {
      localStorage.setItem("avenlab-keyboard-assist-v1", mode);
    } catch {
      /* The preference still works for this page. */
    }
  },
  open: (session, force = false) => {
    if (force || keyboardNeeded(get().mode, get().hardwareObserved))
      set({ session });
  },
  edit: (value) => {
    const session = get().session;
    if (!session) return;
    const next = value.slice(0, session.maxLength);
    session.onChange(next);
    set({ session: { ...session, value: next } });
  },
  sync: (id, value) => {
    const session = get().session;
    if (session?.id === id && session.value !== value)
      set({ session: { ...session, value } });
  },
  close: (cancel = false) => {
    const session = get().session;
    if (!session) return;
    if (cancel) session.onChange(session.initial);
    set({ session: null });
    queueMicrotask(() => {
      if (session.returnFocus?.isConnected)
        session.returnFocus.focus({ preventScroll: true });
    });
  },
}));
