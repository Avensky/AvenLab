import { Mesh, type BufferAttribute, type BufferGeometry, type InterleavedBufferAttribute, type Object3D } from "three";
import catalog from "../../../../avenlab-server/src/assets/character-wardrobe.json";

export const WARDROBE_SETS = catalog;
export type WardrobeChoice = { set: string; shirt: "none" | "under" | "over"; waist: "tucked" | "over" };

/** Preserve the set and waist fit of older outfits that saved a separate shirt. */
export function resolveWardrobe(choice?: WardrobeChoice): WardrobeChoice | undefined {
  const set = catalog.find(item => item.id === choice?.set);
  if (!set || !choice) return undefined;
  return { set: set.id, shirt: "none", waist: choice.waist === "over" ? "over" : "tucked" };
}

export function wardrobeModelUrl(choice: WardrobeChoice | undefined, kind: "garage" | "portrait") {
  const resolved = resolveWardrobe(choice);
  return resolved && __WARDROBE_SET_IDS__.includes(resolved.set)
    ? `/models/characters/wardrobe/${resolved.set}.${kind === "portrait" ? "mobile" : "garage"}.glb` : null;
}

function vestBackVertex(position: BufferAttribute | InterleavedBufferAttribute, vertex: number) {
  const y = position.getY(vertex);
  return y > 1.213 && y < 1.348 && position.getZ(vertex) < -.014 && Math.abs(position.getX(vertex)) < .126;
}

/** A garment swap changes visibility and indices once, never vertex positions per frame. */
export function prepareWardrobe(root: Object3D) {
  const parts: Object3D[] = [];
  const masked: { mesh: Mesh; source: BufferGeometry; geometry: BufferGeometry; indices: Uint32Array[] }[] = [];
  const skirtCoversHips = Boolean(root.getObjectByName("CLOTH_BOTTOM_SKIRT"));
  root.traverse(part => {
    if (typeof part.userData.wardrobeRole === "string") {
      parts.push(part);
      // Keep unconfigured or failed loads covered until apply() selects a complete outfit.
      part.visible = ["bottom", "bottom-seam-tucked", "bottom-trim-tucked", "corset-tucked", "corset-facing"].includes(part.userData.wardrobeRole);
    }
    if (!(part instanceof Mesh)) return;
    const coverage = part.geometry.getAttribute("_aven_coverage");
    const index = part.geometry.getIndex();
    if (!coverage || !index) return;
    const source = part.geometry;
    // Own masked body and inner garments so previews can choose different layers.
    const geometry = source.clone();
    const body = part.userData.wardrobeRole === "body" ? geometry.getAttribute("position") : undefined;
    const indices = Array.from({ length: 2 }, (_, mode) => {
      const visible: number[] = [], bit = 1 << mode;
      for (let i = 0; i < index.count; i += 3) {
        const a = index.getX(i), b = index.getX(i + 1), c = index.getX(i + 2);
        if (body && skirtCoversHips && Math.max(Math.abs(body.getX(a)), Math.abs(body.getX(b)), Math.abs(body.getX(c))) < .203) {
          const bottom = Math.min(body.getY(a), body.getY(b), body.getY(c));
          const top = Math.max(body.getY(a), body.getY(b), body.getY(c));
          // Restore complete lower legs. Hide the surface inside the skirt at the hips.
          if (bottom < .736 && top < .758) { visible.push(a, b, c); continue; }
          if (bottom < 1.02 && top > .736) continue;
        }
        const showVestBack = body && part.userData.wardrobeBackOpening
          && vestBackVertex(body, a) && vestBackVertex(body, b) && vestBackVertex(body, c);
        if ((coverage.getX(a) & coverage.getX(b) & coverage.getX(c) & bit) === 0 || showVestBack) visible.push(a, b, c);
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
      const visible = new Set(["body", "bottom", "corset-facing", `corset-${selected.waist}`, `bottom-seam-${selected.waist}`, `bottom-trim-${selected.waist}`]);
      parts.forEach(part => { part.visible = visible.has(part.userData.wardrobeRole); });
      const mode = selected.waist === "over" ? 1 : 0;
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
