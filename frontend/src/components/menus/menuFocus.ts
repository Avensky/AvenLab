import type { KeyboardEvent } from "react";

// Keep native Tab navigation within the active modal, including its Back button.
export function trapMenuFocus(event: KeyboardEvent<HTMLElement>) {
  if (event.key !== "Tab") return;
  const elements = Array.from(event.currentTarget.querySelectorAll<HTMLElement>("button, [role='button'], input, select, textarea, [tabindex]"))
    .filter((element) => element.tabIndex >= 0 && !element.hasAttribute("disabled"));
  const first = elements[0], last = elements.at(-1);
  if (!first || !last) return;
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
}
