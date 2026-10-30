import { useEffect, type RefObject } from "react";
import { useUIStore, type CockpitTab } from "../../../store/menus/uiStore";
import type { MenuAction } from "../../../controls/inputRouting";
import { COCKPIT_TABS } from "./tabs";
/** One keyboard/controller navigation owner for every cockpit page. Synthetic
 * slider/key steps always include keyup, so contact feedback cannot linger. */
export function useCockpitNavigation(
  root: RefObject<HTMLElement | null>,
  tab: CockpitTab,
) {
  useEffect(() => {
    root.current
      ?.querySelector<HTMLButtonElement>(`[data-cockpit-tab="${tab}"]`)
      ?.focus({ preventScroll: true });
  }, [tab, root]);
  useEffect(() => {
    const stepControl = (control: HTMLElement, key: string) => {
      for (const type of ["keydown", "keyup"])
        control.dispatchEvent(
          new window.KeyboardEvent(type, {
            key,
            code: key,
            bubbles: true,
            cancelable: true,
          }),
        );
    };
    const navigate = (action: MenuAction) => {
      if (action === "back") {
        useUIStore.getState().closeOverlay();
        return;
      }
      if (action === "next_tab" || action === "previous_tab") {
        const state = useUIStore.getState(),
          index = COCKPIT_TABS.findIndex(
            (item) => item.id === state.cockpitTab,
          );
        state.setCockpitTab(
          COCKPIT_TABS[
            (index + (action === "next_tab" ? 1 : -1) + COCKPIT_TABS.length) %
              COCKPIT_TABS.length
          ].id,
        );
        return;
      }
      const buttons = Array.from(
        root.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled),select:not(:disabled),[role="slider"][aria-disabled="false"]',
        ) ?? [],
      ).filter(
        (button) => button.tabIndex >= 0 && button.getClientRects().length > 0,
      );
      const active = document.activeElement as HTMLElement;
      if (
        active?.tagName === "SELECT" &&
        ["left", "right", "activate"].includes(action)
      ) {
        const select = active as HTMLSelectElement;
        select.selectedIndex =
          (select.selectedIndex +
            (action === "left" ? -1 : 1) +
            select.options.length) %
          select.options.length;
        select.dispatchEvent(new Event("change", { bubbles: true }));
        return;
      }
      if (
        (active?.getAttribute("role") === "slider" ||
          active?.getAttribute("aria-label") === "Ignition key") &&
        (action === "left" || action === "right")
      ) {
        stepControl(active, action === "left" ? "ArrowLeft" : "ArrowRight");
        return;
      }
      if (action === "activate") {
        if (buttons.includes(active)) {
          if (active.getAttribute("role") === "slider")
            stepControl(active, "ArrowRight");
          else active.click();
        }
        return;
      }
      const index = buttons.indexOf(active),
        origin = active?.getBoundingClientRect();
      if (!origin) {
        buttons[0]?.focus();
        return;
      }
      const horizontal = action === "left" || action === "right",
        direction = action === "left" || action === "up" ? -1 : 1;
      const ox = origin.x + origin.width / 2,
        oy = origin.y + origin.height / 2;
      const candidates = buttons
        .filter((button) => button !== active)
        .map((button) => {
          const r = button.getBoundingClientRect(),
            dx = r.x + r.width / 2 - ox,
            dy = r.y + r.height / 2 - oy;
          return {
            button,
            primary: (horizontal ? dx : dy) * direction,
            secondary: Math.abs(horizontal ? dy : dx),
          };
        })
        .filter((item) => item.primary > 2)
        .sort(
          (a, b) => a.primary + a.secondary * 3 - (b.primary + b.secondary * 3),
        );
      const next =
        candidates[0]?.button ??
        buttons[(index + direction + buttons.length) % buttons.length];
      next?.focus();
      next?.scrollIntoView({ block: "nearest", inline: "nearest" });
    };
    const event = (e: Event) => navigate((e as CustomEvent<MenuAction>).detail);
    window.addEventListener("avenlab:panel-action", event);
    const keyboard = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        navigate("back");
        return;
      }
      if (
        e.target instanceof HTMLElement &&
        (e.target.tagName === "SELECT" ||
          e.target.getAttribute("role") === "slider" ||
          e.target.getAttribute("aria-label") === "Ignition key")
      )
        return;
      const action = (
        {
          ArrowLeft: "left",
          ArrowRight: "right",
          ArrowUp: "up",
          ArrowDown: "down",
        } as const
      )[e.key as "ArrowLeft"];
      if (action) {
        e.preventDefault();
        e.stopPropagation();
        navigate(action);
      }
    };
    const element = root.current;
    element?.addEventListener("keydown", keyboard);
    return () => {
      window.removeEventListener("avenlab:panel-action", event);
      element?.removeEventListener("keydown", keyboard);
    };
  }, [root]);
}
