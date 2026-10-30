import { useEffect, type RefObject } from "react";

type PanelPress = { pressed: boolean; cancelled?: boolean };

/** Returns true only when a physical panel consumes A. Normal menu rows keep
 * their existing rising-edge activation and never receive a synthetic hold. */
export function routePhysicalMenuPress(pressed: boolean, cancelled = false) {
  return !window.dispatchEvent(
    new CustomEvent<PanelPress>("avenlab:panel-press", {
      detail: { pressed, cancelled },
      cancelable: true,
    }),
  );
}

export function usePhysicalMenuPress(root: RefObject<HTMLElement | null>) {
  useEffect(() => {
    let held: { node: HTMLButtonElement; activate: boolean } | null = null;
    const finish = (cancelled: boolean) => {
      const current = held;
      held = null;
      if (!current) return;
      const { node, activate } = current;
      if (cancelled) node.blur();
      node.removeAttribute("data-hud-held");
      if (!root.current?.contains(node)) return;
      const accepted = node.dispatchEvent(
        new window.KeyboardEvent("keyup", {
          key: " ",
          code: "Space",
          bubbles: true,
          cancelable: true,
        }),
      );
      if (
        !cancelled &&
        activate &&
        accepted &&
        document.activeElement === node &&
        !node.disabled
      )
        node.click();
    };
    const press = (event: Event) => {
      const request = event as CustomEvent<PanelPress>;
      if (!request.detail.pressed) {
        if (held) {
          request.preventDefault();
          finish(Boolean(request.detail.cancelled));
        }
        return;
      }
      const node = document.activeElement;
      if (
        held ||
        !(node instanceof window.HTMLButtonElement) ||
        node.disabled ||
        !root.current?.contains(node) ||
        !node.closest("[data-momentary-controls]")
      )
        return;
      request.preventDefault();
      // Custom controls prevent the key's default action and own their release.
      // Ordinary physical switches get exactly one click when A is released.
      held = {
        node,
        activate: node.dispatchEvent(
          new window.KeyboardEvent("keydown", {
            key: " ",
            code: "Space",
            bubbles: true,
            cancelable: true,
          }),
        ),
      };
    };
    window.addEventListener("avenlab:panel-press", press);
    return () => {
      finish(true);
      window.removeEventListener("avenlab:panel-press", press);
    };
  }, [root]);
}
