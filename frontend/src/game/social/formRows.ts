import type { MenuAction } from "../../controls/inputRouting";

/** Row groups describe visible layout, so horizontal menus never turn into a
 * vertical list. Runs only on navigation events, without measuring the scene. */
export function navigateFormRows(
  root: HTMLElement,
  active: HTMLElement | null,
  action: MenuAction,
  remembered: WeakMap<HTMLElement, number>,
) {
  if (!root.hasAttribute("data-controller-rows")) return false;
  const rows = Array.from(
    root.querySelectorAll<HTMLElement>("[data-controller-row]"),
  )
    .filter((row) => !row.hasAttribute("data-controller-tab-only"))
    .map((row) => ({
      row,
      items: Array.from(
        row.querySelectorAll<HTMLElement>(
          "button,input,select,textarea,[data-controller-selector][tabindex]",
        ),
      ).filter(
        (node) =>
          !node.matches(":disabled") &&
          !node.closest("[hidden],[inert]") &&
          node.checkVisibility?.() !== false &&
          node.tabIndex >= 0,
      ),
    }))
    .filter((group) => group.items.length);
  const index = rows.findIndex((group) => group.items.includes(active!));
  if (index < 0) {
    if (active?.closest(".lobby-chat")) return false;
    const entry = rows.find(({ row }) => !row.hasAttribute("data-controller-header-action")) ?? rows[0];
    const first = entry?.items[0];
    first?.focus({ preventScroll: true });
    if (
      first?.matches("[data-controller-selector]") &&
      (action === "left" || action === "right")
    )
      first
        .querySelector<HTMLButtonElement>(
          `[data-selector-direction="${action === "left" ? "previous" : "next"}"]:not(:disabled)`,
        )
        ?.click();
    return true;
  }
  const group = rows[index],
    current = group.items.indexOf(active!);
  remembered.set(group.row, current);
  const selector = active?.closest<HTMLElement>("[data-controller-selector]");
  if ((action === "left" || action === "right") && selector) {
    selector
      .querySelector<HTMLButtonElement>(
        `[data-selector-direction="${action === "left" ? "previous" : "next"}"]:not(:disabled)`,
      )
      ?.click();
    return true;
  }
  const columns = Math.max(
    1,
    Number(group.row.dataset.controllerColumns) || group.items.length,
  );
  const line = Math.floor(current / columns),
    column = current % columns;
  if (action === "left" || action === "right") {
    const first = line * columns,
      count = Math.min(columns, group.items.length - first);
    const next =
      first + ((column + (action === "left" ? -1 : 1) + count) % count);
    group.items[next]?.focus({ preventScroll: true });
    remembered.set(group.row, next);
    return true;
  }
  if (action === "up" || action === "down") {
    const direction = action === "up" ? -1 : 1,
      nextLine = line + direction;
    if (nextLine >= 0 && nextLine < Math.ceil(group.items.length / columns)) {
      const next = Math.min(
        nextLine * columns + column,
        group.items.length - 1,
      );
      group.items[next]?.focus({ preventScroll: true });
      remembered.set(group.row, next);
    } else {
      const next = rows[index + direction];
      if (next) {
        const preferred =
          remembered.get(next.row) ??
          Math.max(
            0,
            next.items.findIndex((node) =>
              node.matches('[aria-selected="true"],[aria-pressed="true"]'),
            ),
          );
        next.items[Math.min(preferred, next.items.length - 1)]?.focus({
          preventScroll: true,
        });
      }
    }
    return true;
  }
  return false;
}
