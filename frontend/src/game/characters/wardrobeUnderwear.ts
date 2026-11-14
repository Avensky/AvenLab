import { DoubleSide, Group, MathUtils, MeshStandardMaterial, SkinnedMesh, Vector3, type BufferGeometry } from "three";
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

function braCupDepth(x: number, y: number) {
  return .115 + .025 * MathUtils.smoothstep(y, 1.176, 1.223)
    - .033 * MathUtils.smoothstep(y, 1.243, 1.29)
    - .043 * MathUtils.smoothstep(Math.abs(x), .086, .133);
}

function shapeBraCup(geometry: BufferGeometry, trim: number) {
  const positions = geometry.getAttribute("position"), normals = geometry.getAttribute("normal");
  const normal = new Vector3(), cupNormal = new Vector3();
  const step = .001, blendDistance = .003;
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i), y = positions.getY(i), z = positions.getZ(i);
    const strength = MathUtils.smoothstep(z, .048, .080) * (1 - MathUtils.smoothstep(Math.abs(x), .111, .135));
    if (!strength) continue;
    const cup = braCupDepth(x, y) + trim;
    const blend = MathUtils.clamp(.5 + .5 * (cup - z) / blendDistance, 0, 1);
    if (!blend) continue;
    // Follow Top 05's smooth fabric profile over the front while keeping the
    // body-rigged surface around the sides and back.
    const depth = MathUtils.lerp(z, cup, blend) + blendDistance * blend * (1 - blend);
    positions.setZ(i, MathUtils.lerp(z, depth, strength));
    const dx = (braCupDepth(x + step, y) - braCupDepth(x - step, y)) / (2 * step);
    const dy = (braCupDepth(x, y + step) - braCupDepth(x, y - step)) / (2 * step);
    cupNormal.set(-dx, -dy, 1).normalize();
    normal.fromBufferAttribute(normals, i).lerp(cupNormal, strength * blend).normalize();
    normals.setXYZ(i, normal.x, normal.y, normal.z);
  }
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
    const clearance = piece === "briefs" && pieces.briefs === "under-skirt" ? .0008 : .0038;
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
      if (piece === "bra") shapeBraCup(geometry, material === binding ? .0012 : 0);
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
        return clearance + .0004 + (pieces.briefs === "under-skirt" && piece === "briefs" ? .00035 : .0011) * Math.sin(across * Math.PI);
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
    applyColors(colors: (piece: UnderwearPiece) => Required<PieceColors>) {
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
