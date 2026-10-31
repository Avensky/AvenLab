import { useEffect, type RefObject } from "react";
import type { MenuAction } from "../../controls/inputRouting";

/** Native typing stays with inputs. Controller actions move through visible
 * form controls and activate fields to open their assisted keyboard. */
export function useFormNavigation(
  root: RefObject<HTMLElement | null>,
  back: () => void,
  cycleTab: (direction: number) => void,
) {
  useEffect(() => {
    const navigate = (action: MenuAction) => {
      if (action === "back") {
        back();
        return;
      }
      if (action === "next_tab" || action === "previous_tab") {
        cycleTab(action === "next_tab" ? 1 : -1);
        return;
      }
      const controls = Array.from(
        root.current?.querySelectorAll<HTMLElement>(
          'button,input:not([type="hidden"]),select,textarea',
        ) ?? [],
      ).filter(
        (node) =>
          !node.matches(":disabled") &&
          !node.closest("[hidden],[inert]") &&
          node.tabIndex >= 0,
      );
      const active = document.activeElement as HTMLElement;
      if (action === "activate") {
        if (controls.includes(active)) active.click();
        else controls[0]?.focus();
        return;
      }
      // Portrait grids navigate spatially without selecting a hero on focus.
      // At an edge, normal form navigation can reach chat/footer controls.
      const grid = active?.closest<HTMLElement>("[data-controller-grid]");
      if (grid && (action === "up" || action === "down")) {
        const items = Array.from(
          grid.querySelectorAll<HTMLElement>("[data-grid-item]"),
        ).filter((node) => !node.matches(":disabled"));
        const columns = Math.max(
          1,
          Number(grid.dataset.controllerColumns) || 1,
        );
        const target =
          items.indexOf(active) + (action === "up" ? -columns : columns);
        if (target >= 0 && target < items.length) {
          items[target].focus({ preventScroll: true });
          return;
        }
      }
      if (
        active instanceof HTMLSelectElement &&
        (action === "left" || action === "right")
      ) {
        active.selectedIndex =
          (active.selectedIndex +
            (action === "left" ? -1 : 1) +
            active.options.length) %
          active.options.length;
        active.dispatchEvent(new Event("change", { bubbles: true }));
        return;
      }
      const index = controls.indexOf(active),
        direction = action === "left" || action === "up" ? -1 : 1;
      const next =
        controls[(index + direction + controls.length) % controls.length];
      next?.focus({ preventScroll: true });
      next?.scrollIntoView({ block: "nearest", inline: "nearest" });
    };
    const panel = (event: Event) =>
      navigate((event as CustomEvent<MenuAction>).detail);
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        back();
        return;
      }
      if ((event.target as HTMLElement).matches("input,textarea,select"))
        return;
      const action = (
        {
          ArrowUp: "up",
          ArrowDown: "down",
          ArrowLeft: "left",
          ArrowRight: "right",
        } as const
      )[event.key as "ArrowUp"];
      if (action) {
        event.preventDefault();
        event.stopPropagation();
        navigate(action);
      }
    };
    window.addEventListener("avenlab:panel-action", panel);
    const element = root.current;
    element?.addEventListener("keydown", keyboard);
    return () => {
      window.removeEventListener("avenlab:panel-action", panel);
      element?.removeEventListener("keydown", keyboard);
    };
  }, [root, back, cycleTab]);
}
