import { DoubleSide, MathUtils, Mesh, MeshStandardMaterial, SkinnedMesh, type BufferGeometry, type Object3D } from "three";
import { fitHighCollarShoulders, fitHighCollarSurface } from "./highCollarFit";
import { fitLacedBodice } from "./lacedStrapFit";
import { fitSweetheartCorset } from "./sweetheartTuck";
import { prepareUnderbustColors } from "./underbustColors";
import { fitUnderbustVest, UNDERBUST_FIT_VERSION } from "./underbustFit";
import { fitWardrobeSurface } from "./wardrobeSurface";

type CorsetStyle = "01" | "02" | "03" | "04" | "05";

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
  let geometry: BufferGeometry | undefined;
  let waistFacings: NonNullable<ReturnType<typeof fitLacedBodice>>["waistFacings"] | undefined;
  let disposeFit: (() => void) | undefined;
  switch (style) {
    case "01": {
      const bodice = fitLacedBodice(root, body.geometry);
      geometry = bodice?.straps;
      waistFacings = bodice?.waistFacings;
      disposeFit = bodice?.disposeShell;
      break;
    }
    case "02":
      geometry = fitSweetheartCups(body.geometry);
      disposeFit = fitSweetheartCorset(root, body.geometry);
      break;
    case "04": {
      const baked = [corset, root.getObjectByName("CLOTH_CORSET_OVER")].every(part =>
        part?.userData.underbustFitVersion === UNDERBUST_FIT_VERSION);
      const disposeVest = baked ? undefined : fitUnderbustVest(root, body.geometry);
      const disposeColors = prepareUnderbustColors(root);
      return () => { disposeColors?.(); disposeVest?.(); };
    }
    case "05":
      geometry = fitHighCollarSurface(body.geometry);
      disposeFit = fitHighCollarShoulders(root, body.geometry);
      break;
    default:
      geometry = fitRuffledNeckline(body.geometry);
  }
  if (!geometry) return disposeFit;

  const material = new MeshStandardMaterial({
    name: "MAT_CORSET_FACING", color: fabric.color, roughness: style === "01" ? .89 : style === "03" ? .91 : fabric.roughness,
    envMapIntensity: style === "01" ? .30 : fabric.envMapIntensity, side: DoubleSide,
  });
  material.userData.color_slot = "fabric";
  const facings: SkinnedMesh[] = [];
  const addFacing = (name: string, role: string, surface?: BufferGeometry) => {
    if (!surface) return;
    const facing = body.clone(false);
    facing.name = name;
    facing.userData = { wardrobeRole: role, clothingPiece: "corset" };
    facing.geometry = surface;
    facing.material = material;
    body.parent?.add(facing);
    facings.push(facing);
  };
  addFacing("CLOTH_CORSET_FACING", "corset-facing", geometry);
  addFacing("CLOTH_CORSET_WAIST_TUCKED", "corset-facing-tucked", waistFacings?.[0]);
  addFacing("CLOTH_CORSET_WAIST_OVER", "corset-facing-over", waistFacings?.[1]);
  return () => {
    for (const facing of facings) {
      facing.removeFromParent();
      facing.geometry.dispose();
    }
    material.dispose();
    disposeFit?.();
  };
}
