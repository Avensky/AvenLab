/** Resize subscriptions are stable until a layout root mounts/unmounts. A text
 * update inside a gauge or teammate card is not a reason to reconnect every
 * ResizeObserver (observe() itself queues an initial resize notification). */
export function observeHudLayout(
  host: Element,
  readTargets: () => Iterable<Element>,
  measure: () => void,
  mutationRoot: Element = host,
) {
  let frame: number | null = null;
  const schedule = () => {
    if (frame !== null) return;
    frame = window.requestAnimationFrame(() => { frame = null; measure(); });
  };
  const resize = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(schedule);
  let targets = new Set<Element>();
  const refresh = () => {
    const next = new Set([host, ...readTargets()]);
    let changed = next.size !== targets.size;
    for (const target of targets) if (!next.has(target)) { resize?.unobserve(target); changed = true; }
    for (const target of next) if (!targets.has(target)) { resize?.observe(target); changed = true; }
    targets = next;
    if (changed) schedule();
  };
  // Replacing a text node cannot add or remove a layout target. A genuine
  // size change caused by longer text still reaches the ResizeObserver.
  const hasElement = (nodes: NodeList) => {
    for (const node of nodes) if (node.nodeType === 1) return true;
    return false;
  };
  const mutation = new window.MutationObserver(records => {
    if (records.some(record => hasElement(record.addedNodes) || hasElement(record.removedNodes))) refresh();
  });
  mutation.observe(mutationRoot, {childList: true, subtree: true});
  refresh();
  window.addEventListener('resize', schedule);
  return () => {
    if (frame !== null) window.cancelAnimationFrame(frame);
    resize?.disconnect(); mutation.disconnect(); window.removeEventListener('resize', schedule);
  };
}

/** Avoid writing the same layout value again from the resize callback. */
export function setHudStyle(element: HTMLElement, name: string, value: string) {
  if (element.style.getPropertyValue(name) !== value) element.style.setProperty(name, value);
}
