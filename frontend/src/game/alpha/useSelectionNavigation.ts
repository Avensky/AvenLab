import {useUIStore} from "../../store/menus/uiStore";
import { useEffect, type RefObject } from "react";
import { isTypingTarget, type MenuAction } from "../../controls/inputRouting";

type Handlers = {
  confirm: () => void;
  back: () => void;
  direction: (action: MenuAction) => void;
  tab: (direction: number) => void;
  option?: (direction: number) => void;
};

/** Selection has one primary action, independent of footer focus. Native text
 * editing and the assisted chat keyboard retain their existing input owner. */
export function useSelectionNavigation(
  root: RefObject<HTMLElement | null>,
  { confirm, back, direction, tab, option }: Handlers,
) {
  useEffect(() => {
    const action = (next: MenuAction) => {
      if(["hero_abilities","match_results"].includes(useUIStore.getState().overlay??""))return;
      const active = document.activeElement as HTMLElement | null;
      const chat = active?.closest('.lobby-chat[data-expanded="true"]');
      if (chat) {
        if (next === "back")
          window.dispatchEvent(new Event("avenlab:chat-close"));
        else if (next === "activate") active?.click();
        else if (["up", "down", "left", "right"].includes(next)) {
          const nodes = [
            ...chat.querySelectorAll<HTMLElement>("button,input,select"),
          ].filter((n) => !n.matches(":disabled") && n.tabIndex >= 0);
          const index = nodes.indexOf(active!),
            step = next === "left" || next === "up" ? -1 : 1;
          nodes[(index + step + nodes.length) % nodes.length]?.focus();
        }
        return;
      }
      if (next === "activate") confirm();
      else if (next === "back") back();
      else if (next === "next_tab" || next === "previous_tab")
        tab(next === "next_tab" ? 1 : -1);
      else if (next === "next_option" || next === "previous_option")
        option?.(next === "next_option" ? 1 : -1);
      else direction(next);
    };
    const panel = (event: Event) =>
      action((event as CustomEvent<MenuAction>).detail);
    const keyboard = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.ctrlKey ||
        event.altKey ||
        event.metaKey
      )
        return;
      if (event.code === "Tab") {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      if (
        isTypingTarget(event.target) ||
        (event.target as HTMLElement).closest(".lobby-chat")
      )
        return;
      const key = (
        {
          ArrowUp: "up",
          ArrowDown: "down",
          ArrowLeft: "left",
          ArrowRight: "right",
          Numpad8: "up",
          Numpad2: "down",
          Numpad4: "left",
          Numpad6: "right",
          Enter: "activate",
          Space: "activate",
          Escape: "back",
          KeyQ: "previous_tab",
          KeyE: "next_tab",
          PageUp: "previous_tab",
          PageDown: "next_tab",
          Digit1: "previous_option",
          Digit3: "next_option",
          Numpad1: "previous_option",
          Numpad3: "next_option",
        } as Record<string, MenuAction>
      )[event.code || event.key];
      if (!key) return;
      event.preventDefault();
      event.stopPropagation();
      if (!event.repeat || ["up", "down", "left", "right"].includes(key))
        action(key);
    };
    const element = root.current;
    window.addEventListener("avenlab:panel-action", panel);
    element?.addEventListener("keydown", keyboard);
    return () => {
      window.removeEventListener("avenlab:panel-action", panel);
      element?.removeEventListener("keydown", keyboard);
    };
  }, [root, confirm, back, direction, tab, option]);
}
