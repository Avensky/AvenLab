import { DoubleSide, MathUtils, Mesh, MeshStandardMaterial, SkinnedMesh, type BufferGeometry, type Object3D } from "three";
import { fitHighCollarSurface } from "./highCollarFit";
import { fitUnderbustChest } from "./underbustFit";
import { fitWardrobeSurface } from "./wardrobeSurface";

// Neckline and back-edge heights in the shared Vesper wardrobe bind space.
const fits = {
  "02": { front: 1.266, back: 1.255 },
  "03": { front: 1.270, back: 1.253 },
} as const;
type CorsetStyle = keyof typeof fits | "01" | "04" | "05";

/** Back the small spot where skin crosses the original left rear strap in motion. */
function fitLacedRearStrap(body: BufferGeometry) {
  return fitWardrobeSurface(body, [
    point => point.y - 1.337,
    point => 1.38 - point.y,
    point => -.05 - point.z,
    point => {
      const center = MathUtils.lerp(.114, .108, MathUtils.smoothstep(point.y, 1.337, 1.38));
      return .014 - Math.abs(point.x - center);
    },
  ], .0035);
}

function fitLowNeckline(body: BufferGeometry, { front, back }: { front: number; back: number }) {
  return fitWardrobeSurface(body, [
    point => point.y - 1.174,
    point => .153 - Math.abs(point.x),
    point => {
      const x = Math.abs(point.x);
      const frontEdge = front + .028 * MathUtils.smoothstep(x, .022, .069);
      const backEdge = back - .081 * MathUtils.smoothstep(x, .104, .153);
      return MathUtils.lerp(backEdge, frontEdge, MathUtils.smoothstep(point.z, -.014, .066)) - point.y;
    },
  ], .003);
}

/** Fit an opaque facing to the same surface and skin weights as the torso. */
export function prepareWardrobeLining(root: Object3D) {
  const body = root.getObjectByName("BODY_WARDROBE");
  const corset = root.getObjectByName("CLOTH_CORSET_TUCKED");
  if (!(body instanceof SkinnedMesh) || !body.parent || !corset) return;
  for (const name of ["CLOTH_SHIRT_UNDER", "CLOTH_SHIRT_OVER_TUCKED", "CLOTH_SHIRT_OVER_OVER"]) {
    root.getObjectByName(name)?.removeFromParent();
  }
  let fabric: MeshStandardMaterial | undefined;
  corset.traverse(part => {
    if (fabric || !(part instanceof Mesh)) return;
    const materials = Array.isArray(part.material) ? part.material : [part.material];
    fabric = materials.find(material => material instanceof MeshStandardMaterial && material.userData.color_slot === "fabric");
  });
  const style = fabric?.name.match(/^MAT_CORSET_(0[1-5])_/u)?.[1] as CorsetStyle | undefined;
  if (!fabric || !style) return;
  if (style === "04") body.userData.wardrobeBackOpening = true;
  const geometry = style === "01" ? fitLacedRearStrap(body.geometry)
    : style === "04" ? fitUnderbustChest(body)
    : style === "05" ? fitHighCollarSurface(body.geometry)
    : fitLowNeckline(body.geometry, fits[style]);
  if (!geometry) return;

  const material = new MeshStandardMaterial({
    name: "MAT_CORSET_FACING", color: fabric.color, roughness: style === "02" || style === "03" ? .91 : fabric.roughness, side: DoubleSide,
  });
  material.userData.color_slot = "fabric";
  const facing = body.clone(false);
  facing.name = "CLOTH_CORSET_FACING";
  facing.userData = { wardrobeRole: "corset-facing", clothingPiece: "corset" };
  facing.geometry = geometry;
  facing.material = material;
  body.parent.add(facing);
  return () => {
    facing.removeFromParent();
    geometry.dispose();
    material.dispose();
  };
}
