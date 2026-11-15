import { DoubleSide, Group, MathUtils, MeshStandardMaterial, SkinnedMesh, type BufferGeometry, type Vector3 } from "three";
import { DEFAULT_UNDERWEAR_COLORS, type PieceColors, type UnderwearPiece } from "./clothingPieces";
import { fitWardrobeSurface } from "./wardrobeSurface";

const front = (point: Vector3) => MathUtils.smoothstep(point.z, -.026, .067);

function braNeckline(point: Vector3) {
  const x = Math.abs(point.x);
  // Top 05's strapless upper contour, with a shallow dip between the cups.
  const cup = 1.269 + .017 * MathUtils.smoothstep(x, .015, .062)
    - .029 * MathUtils.smoothstep(x, .084, .126);
  return MathUtils.lerp(1.244, cup, front(point));
}

function braHem(point: Vector3) {
  const cup = 1.181 + .010 * MathUtils.smoothstep(Math.abs(point.x), .024, .115);
  return MathUtils.lerp(1.191, cup, front(point));
}

function briefsWaist(point: Vector3) {
  const side = .013 * MathUtils.smoothstep(Math.abs(point.x), .031, .129);
  return MathUtils.lerp(1.023, 1.012, front(point)) + side;
}

function briefsLeg(point: Vector3) {
  const x = Math.abs(point.x);
  const frontCut = .824 + .138 * MathUtils.smoothstep(x, .026, .143);
  const rearCut = .824 + .117 * MathUtils.smoothstep(x, .041, .149);
  return MathUtils.lerp(rearCut, frontCut, front(point));
}

/** Trace opaque fabric and its binding from the same rig as the restored skin. */
export function prepareWardrobeUnderwear(body: SkinnedMesh, pieces: { bra: boolean; briefs: false | "under-skirt" | "standalone" }) {
  const group = new Group();
  group.name = "wardrobe-underwear";
  const materials = new Map<UnderwearPiece, { fabric: MeshStandardMaterial; binding: MeshStandardMaterial }>();

  type Edge = (point: Vector3) => number;
  function makePiece(piece: UnderwearPiece, upper: Edge, lower: Edge, halfWidth: number) {
    const aboveHem = (point: Vector3) => point.y - lower(point);
    const belowTop = (point: Vector3) => upper(point) - point.y;
    const boundaries = [aboveHem, belowTop, (point: Vector3) => halfWidth - Math.abs(point.x)];
    const clearance = piece === "bra" ? .00115 : .0008;
    const shell = fitWardrobeSurface(body.geometry, boundaries, clearance);
    if (!shell) return;

    const fabric = new MeshStandardMaterial({ name: "MAT_WARDROBE_UNDERWEAR", color: DEFAULT_UNDERWEAR_COLORS.color, roughness: .9, side: DoubleSide });
    fabric.userData.color_slot = "fabric";
    const binding = new MeshStandardMaterial({ name: "MAT_WARDROBE_UNDERWEAR_BINDING", color: DEFAULT_UNDERWEAR_COLORS.accent, roughness: .87, side: DoubleSide });
    binding.userData.color_slot = "accent";
    materials.set(piece, { fabric, binding });
    const item = new Group();
    item.name = `wardrobe-underwear-${piece}`;
    item.userData.clothingPiece = piece;
    function addMesh(label: string, geometry: BufferGeometry | undefined, material: MeshStandardMaterial) {
      if (!geometry) return;
      const mesh = body.clone(false);
      mesh.name = `${item.name}-${label}`;
      mesh.userData = { clothingPiece: piece };
      mesh.geometry = geometry;
      mesh.material = material;
      mesh.frustumCulled = false;
      item.add(mesh);
    }
    addMesh("fabric", shell, fabric);
    const addBinding = (label: string, distanceFromEdge: Edge, width: number) => {
      const foldedEdge = (point: Vector3) => {
        const across = MathUtils.clamp(distanceFromEdge(point) / width, 0, 1);
        return clearance + .0003 + .00035 * Math.sin(across * Math.PI);
      };
      addMesh(label, fitWardrobeSurface(body.geometry, [...boundaries, point => width - distanceFromEdge(point)], foldedEdge), binding);
    };
    addBinding("top-binding", belowTop, piece === "briefs" ? .010 : .005);
    addBinding("hem-binding", aboveHem, piece === "briefs" ? .006 : .008);
    group.add(item);
    return item;
  }

  const bra = pieces.bra ? makePiece("bra", braNeckline, braHem, .145) : undefined;
  const briefs = pieces.briefs ? makePiece("briefs", briefsWaist, briefsLeg, .185) : undefined;
  return {
    group, bra, briefs,
    applyColors(colors: (piece: UnderwearPiece) => Required<Pick<PieceColors, "color" | "accent">>) {
      for (const [piece, { fabric, binding }] of materials) {
        const { color, accent } = colors(piece);
        fabric.color.set(color);
        binding.color.set(accent);
      }
    },
    dispose() {
      group.removeFromParent();
      group.traverse(mesh => {
        if (mesh instanceof SkinnedMesh) mesh.geometry.dispose();
      });
      for (const { fabric, binding } of materials.values()) {
        fabric.dispose();
        binding.dispose();
      }
    },
  };
}
