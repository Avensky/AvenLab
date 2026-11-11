import { DoubleSide, MathUtils, Mesh, MeshStandardMaterial, SkinnedMesh, type BufferGeometry, type Object3D } from "three";
import { fitWardrobeSurface } from "./wardrobeSurface";

// Neckline and back-edge heights in the shared Vesper wardrobe bind space.
const fits = {
  "01": { front: 1.278, back: 1.383 },
  "02": { front: 1.266, back: 1.255 },
  "03": { front: 1.270, back: 1.253 },
  "05": { front: 1.281, back: 1.416 },
} as const;

function fitCorsetShell(root: Object3D, style: "01" | "04") {
  const changed: BufferGeometry[] = [];
  for (const name of ["CLOTH_CORSET_TUCKED", "CLOTH_CORSET_OVER"]) {
    root.getObjectByName(name)?.traverse(part => {
      if (!(part instanceof SkinnedMesh)) return;
      const geometry = part.geometry.clone();
      const positions = geometry.getAttribute("position");
      for (let i = 0; i < positions.count; i++) {
        const x = positions.getX(i), y = positions.getY(i), z = positions.getZ(i);
        const across = Math.abs(x);
        if (style === "01") {
          const strap = MathUtils.smoothstep(y, 1.28, 1.335) * MathUtils.smoothstep(across, .065, .103);
          const wing = strap * MathUtils.smoothstep(z, .032, .09) * MathUtils.smoothstep(across, .106, .145)
            * (1 - MathUtils.smoothstep(y, 1.335, 1.382));
          const clearance = MathUtils.lerp(-.014, .005, MathUtils.smoothstep(z, -.018, .055));
          positions.setXYZ(i, x * (1 + .018 * strap) - Math.sign(x) * .030 * wing,
            y + .007 * strap * MathUtils.smoothstep(y, 1.313, 1.387), z + clearance * strap);
        } else {
          const front = MathUtils.smoothstep(z, .035, .102) * (1 - MathUtils.smoothstep(across, .105, .168));
          const bust = MathUtils.smoothstep(y, 1.175, 1.248) * (1 - MathUtils.smoothstep(y, 1.295, 1.385));
          const expand = front * MathUtils.smoothstep(y, 1.151, 1.246);
          const back = (1 - MathUtils.smoothstep(z, -.035, .009)) * (1 - MathUtils.smoothstep(across, .09, .145));
          const lowerBack = MathUtils.smoothstep(y, 1.194, 1.226) * (1 - MathUtils.smoothstep(y, 1.253, 1.292));
          positions.setXYZ(i, x * (1 + .04 * expand), y + .058 * front * bust + .012 * back * lowerBack,
            z + .017 * expand - .005 * back * MathUtils.smoothstep(y, 1.19, 1.23));
        }
      }
      geometry.computeVertexNormals();
      part.geometry = geometry;
      changed.push(geometry);
    });
  }
  return () => changed.forEach(geometry => geometry.dispose());
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
  const style = fabric?.name.match(/^MAT_CORSET_(0[1-5])_/u)?.[1] as keyof typeof fits | "04" | undefined;
  if (!fabric || !style) return;
  const disposeShell = style === "01" || style === "04" ? fitCorsetShell(root, style) : undefined;
  if (style === "04") {
    body.userData.wardrobeBackOpening = true;
    return disposeShell;
  }
  const { front, back } = fits[style];
  const geometry = fitWardrobeSurface(body.geometry, [
    point => point.y - 1.174,
    point => .153 - Math.abs(point.x),
    point => {
      const x = Math.abs(point.x);
      const frontEdge = front + .028 * MathUtils.smoothstep(x, .022, .069);
      const backEdge = back - .081 * MathUtils.smoothstep(x, .104, .153);
      return MathUtils.lerp(backEdge, frontEdge, MathUtils.smoothstep(point.z, -.014, .066)) - point.y;
    },
  ], .003);
  if (!geometry) return disposeShell;

  const material = new MeshStandardMaterial({
    name: "MAT_CORSET_FACING", color: fabric.color, roughness: .91, side: DoubleSide,
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
    disposeShell?.();
    geometry.dispose();
    material.dispose();
  };
}
