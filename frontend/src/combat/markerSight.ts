import type { Intersection, Object3D, Raycaster } from 'three';

/** Visible labels take turns. Keep the total cost bounded as the roster grows. */
export class MarkerSightBudget {
  private waiting = new Set<string>();
  private next = -Infinity;

  claim(id: string, now: number) {
    this.waiting.add(id);
    if (now < this.next || this.waiting.values().next().value !== id) return false;
    this.waiting.delete(id);
    this.next = now + 1000 / 20;
    return true;
  }

  forget(id: string) { this.waiting.delete(id); }
}

/** Only the existence of a visible obstruction matters. Use Three's exact
 * per-object intersection and layer rules, skipping invisible subtrees. */
export function hasSightBlocker(node: Object3D, ray: Raycaster, hits: Intersection[]): boolean {
  if (!node.visible || node.userData.hudSightTransparent === true) return false;
  if (node.layers.test(ray.layers)) {
    hits.length = 0;
    const descend: unknown = node.raycast(ray, hits);
    for (const hit of hits) {
      let owner: Object3D | null = hit.object;
      while (owner && owner.visible) owner = owner.parent;
      if (!owner) return true;
    }
    if (descend === false) return false;
  }
  for (const child of node.children) if (hasSightBlocker(child, ray, hits)) return true;
  return false;
}
