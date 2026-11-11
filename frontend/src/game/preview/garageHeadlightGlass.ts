import { Box3, Matrix4, Mesh, type Material, type Object3D } from "three";
import type { GarageLensStyle, GaragePoint } from "./garageDiagnosticsStore";

const namedHeadlightCover = /head.?(?:light|lamp).*(?:cover|lens|glass)|(?:cover|lens|glass).*head.?(?:light|lamp)/i;
const otherGlass = /red|amber|orange|mirror|reflector|windshield|windscreen|rear|tail/i;
const possibleCover = /glass|lens|cover|window/i;

/** Only clone whole front lamp covers. A combined windshield/lamp atlas
 * stays intact when its GLB doesn't provide a separate front cover. */
export function prepareGarageHeadlightGlass(root: Object3D, mounts: readonly GaragePoint[]) {
  const entries: Array<{ mesh: Mesh; original: Material | Material[]; covers: [Material, Material][] }> = [];
  if (mounts.length) {
    root.updateWorldMatrix(true, true);
    const toRoot = root.matrixWorld.clone().invert();
    const transform = new Matrix4();
    const bounds = new Box3();
    const front = Math.min(...mounts.map(point => point[2]));
    root.traverse(object => {
      if (!(object instanceof Mesh)) return;
      const original = object.material;
      const slots = Array.isArray(original) ? original : [original];
      const coverMesh = namedHeadlightCover.test(object.name);
      if (!coverMesh && !slots.some(material => possibleCover.test(material.name) && !otherGlass.test(material.name))) return;
      if (!object.geometry.boundingBox) object.geometry.computeBoundingBox();
      if (!object.geometry.boundingBox) return;
      bounds.copy(object.geometry.boundingBox).applyMatrix4(transform.multiplyMatrices(toRoot, object.matrixWorld));
      if (bounds.min.z < front - .50 || bounds.max.z < front - .18) return;
      const covers: [Material, Material][] = [];
      const adapted = slots.map(material => {
        if (otherGlass.test(material.name) ||
            !(possibleCover.test(material.name) || coverMesh && slots.length === 1)) return material;
        const cover = material.clone();
        covers.push([cover, material]);
        return cover;
      });
      if (!covers.length) return;
      entries.push({ mesh: object, original, covers });
      object.material = Array.isArray(original) ? adapted : adapted[0];
    });
  }
  return {
    count: entries.length,
    apply(style: GarageLensStyle) {
      for (const { covers } of entries) {
        for (const [cover, source] of covers) {
          cover.visible = source.visible && style !== "hidden";
          cover.opacity = style === "clear" ? .16 : source.opacity;
          cover.transparent = style === "clear" || source.transparent;
          cover.depthWrite = style === "clear" ? false : source.depthWrite;
          cover.alphaTest = style === "clear" ? 0 : source.alphaTest;
          cover.needsUpdate = true;
        }
      }
    },
    dispose() {
      for (const { mesh, original, covers } of entries) {
        mesh.material = original;
        for (const [cover] of covers) cover.dispose();
      }
    },
  };
}
