import { Mesh, type BufferGeometry, type Object3D } from "three";
import catalog from "../../../../avenlab-server/src/assets/character-wardrobe.json";

export const WARDROBE_SETS = catalog;
export type WardrobeChoice = { set: string; shirt: "none" | "under" | "over"; waist: "tucked" | "over" };

/** Resolve persisted choices against the shared catalog, including coverage rules. */
export function resolveWardrobe(choice?: WardrobeChoice): WardrobeChoice | undefined {
  const set = catalog.find(item => item.id === choice?.set);
  if (!set || !choice) return undefined;
  const shirt = choice.shirt === "over" ? "over" : choice.shirt === "under" || set.requiresShirt ? "under" : "none";
  return { set: set.id, shirt, waist: choice.waist === "over" ? "over" : "tucked" };
}

export function wardrobeModelUrl(choice: WardrobeChoice | undefined, kind: "garage" | "portrait") {
  const resolved = resolveWardrobe(choice);
  return resolved && __WARDROBE_SET_IDS__.includes(resolved.set)
    ? `/models/characters/wardrobe/${resolved.set}.${kind === "portrait" ? "mobile" : "garage"}.glb` : null;
}

/** A garment swap changes visibility and indices once, never vertex positions per frame. */
export function prepareWardrobe(root: Object3D) {
  const parts: Object3D[] = [];
  const masked: { mesh: Mesh; source: BufferGeometry; geometry: BufferGeometry; indices: Uint32Array[] }[] = [];
  root.traverse(part => {
    if (typeof part.userData.wardrobeRole === "string") {
      parts.push(part);
      // Keep unconfigured or failed loads covered until apply() selects a complete outfit.
      part.visible = ["bottom", "shorts", "shirt-under"].includes(part.userData.wardrobeRole);
    }
    if (!(part instanceof Mesh)) return;
    const coverage = part.geometry.getAttribute("_aven_coverage");
    const index = part.geometry.getIndex();
    if (!coverage || !index) return;
    const source = part.geometry;
    // Own masked body and inner garments so previews can choose different layers.
    const geometry = source.clone();
    const indices = Array.from({ length: 6 }, (_, mode) => {
      const visible: number[] = [], bit = 1 << mode;
      for (let i = 0; i < index.count; i += 3) {
        const a = index.getX(i), b = index.getX(i + 1), c = index.getX(i + 2);
        if ((coverage.getX(a) & coverage.getX(b) & coverage.getX(c) & bit) === 0) visible.push(a, b, c);
      }
      return Uint32Array.from(visible);
    });
    part.geometry = geometry;
    masked.push({ mesh: part, source, geometry, indices });
  });
  let lastMode = -1;
  return {
    apply(choice?: WardrobeChoice) {
      const selected = resolveWardrobe(choice);
      if (!parts.length || !selected) return;
      const visible = new Set(["body", "bottom", "shorts", `corset-${selected.waist}`]);
      if (selected.shirt === "under") visible.add("shirt-under");
      if (selected.shirt === "over") visible.add(`shirt-over-${selected.waist}`);
      parts.forEach(part => { part.visible = visible.has(part.userData.wardrobeRole); });
      const mode = ["none", "under", "over"].indexOf(selected.shirt) * 2 + (selected.waist === "over" ? 1 : 0);
      if (mode === lastMode) return;
      lastMode = mode;
      for (const { geometry, indices } of masked) {
        const index = geometry.getIndex()!;
        index.array.set(indices[mode]);
        index.needsUpdate = true;
        geometry.clearGroups();
        geometry.setDrawRange(0, indices[mode].length);
      }
    },
    dispose() {
      for (const { mesh, source, geometry } of masked) {
        mesh.geometry = source;
        geometry.dispose();
      }
    },
  };
}
