import { DoubleSide, MathUtils, Mesh, MeshStandardMaterial, SkinnedMesh, type BufferGeometry, type Object3D } from "three";
import { fitHighCollarSurface } from "./highCollarFit";
import { fitUnderbustChest } from "./underbustFit";
import { fitWardrobeSurface } from "./wardrobeSurface";

type CorsetStyle = "01" | "02" | "03" | "04" | "05";

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

/** Back the two cups while leaving the lace opening, waist, and back clear. */
function fitSweetheartCups(body: BufferGeometry) {
  return fitWardrobeSurface(body, [
    point => point.y - 1.255,
    point => point.z - .065,
    point => .111 - Math.abs(point.x),
    point => Math.abs(point.x) - .023,
    point => 1.270 + .028 * MathUtils.smoothstep(Math.abs(point.x), .022, .069) - point.y,
  ], .0015);
}

function fitRuffledNeckline(body: BufferGeometry) {
  return fitWardrobeSurface(body, [
    point => point.y - 1.174,
    point => .153 - Math.abs(point.x),
    point => {
      const x = Math.abs(point.x);
      const frontEdge = 1.270 + .028 * MathUtils.smoothstep(x, .022, .069);
      const backEdge = 1.253 - .081 * MathUtils.smoothstep(x, .104, .153);
      return MathUtils.lerp(backEdge, frontEdge, MathUtils.smoothstep(point.z, -.014, .066)) - point.y;
    },
  ], .003);
}

/** Fit an opaque facing to the same surface and skin weights as the torso. */
export function prepareWardrobeLining(root: Object3D) {
  const body = root.getObjectByName("BODY_WARDROBE");
  const corset = root.getObjectByName("CLOTH_CORSET_TUCKED");
  if (!(body instanceof SkinnedMesh) || !body.parent || !corset) return;
  const retiredShirts: Object3D[] = [];
  root.traverse(part => {
    const role = part.userData.wardrobeRole;
    if (typeof role === "string" && role.startsWith("shirt-")) retiredShirts.push(part);
  });
  for (const shirt of retiredShirts) shirt.removeFromParent();
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
    : style === "02" ? fitSweetheartCups(body.geometry)
    : style === "04" ? fitUnderbustChest(body)
    : style === "05" ? fitHighCollarSurface(body.geometry)
    : fitRuffledNeckline(body.geometry);
  if (!geometry) return;

  const material = new MeshStandardMaterial({
    name: "MAT_CORSET_FACING", color: fabric.color, roughness: style === "03" ? .91 : fabric.roughness, side: DoubleSide,
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
