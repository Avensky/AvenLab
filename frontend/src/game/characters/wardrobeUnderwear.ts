import { DoubleSide, Group, MathUtils, MeshStandardMaterial, SkinnedMesh, type BufferGeometry, type Vector3 } from "three";
import { DEFAULT_UNDERWEAR_COLORS, type PieceColors, type UnderwearPiece } from "./clothingPieces";
import { fitWardrobeSurface } from "./wardrobeSurface";

export type BraStyle = "classic" | "push-up";

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

function pushUpNeckline(point: Vector3) {
  const x = Math.abs(point.x);
  const cup = 1.205 + .042 * MathUtils.smoothstep(x, .014, .054)
    - .033 * MathUtils.smoothstep(x, .082, .132);
  return MathUtils.lerp(1.244, cup, front(point));
}

function pushUpHem(point: Vector3) {
  const x = Math.abs(point.x);
  const cup = 1.193 + .010 * MathUtils.smoothstep(x, .018, .055)
    + .013 * MathUtils.smoothstep(x, .080, .127);
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

type UnderwearStyle = BraStyle | "briefs";
type UnderwearCut = {
  fabric: BufferGeometry;
  topBinding?: BufferGeometry;
  hemBinding?: BufferGeometry;
};

const patterns = {
  classic: { upper: braNeckline, lower: braHem, halfWidth: .145, clearance: .00115, topWidth: .005, hemWidth: .008 },
  "push-up": { upper: pushUpNeckline, lower: pushUpHem, halfWidth: .145, clearance: .00115, topWidth: .003, hemWidth: .005 },
  briefs: { upper: briefsWaist, lower: briefsLeg, halfWidth: .185, clearance: .0008, topWidth: .010, hemWidth: .006 },
};

export function insideBraNeckline(style: BraStyle, point: Vector3) {
  const { upper, topWidth } = patterns[style];
  return point.y < upper(point) - topWidth;
}

function traceUnderwear(source: BufferGeometry, style: UnderwearStyle): UnderwearCut | undefined {
  const { upper, lower, halfWidth, clearance, topWidth, hemWidth } = patterns[style];
  const aboveHem = (point: Vector3) => point.y - lower(point);
  const belowTop = (point: Vector3) => upper(point) - point.y;
  const boundaries = [aboveHem, belowTop, (point: Vector3) => halfWidth - Math.abs(point.x)];
  const fabric = fitWardrobeSurface(source, boundaries, clearance);
  if (!fabric) return;
  const traceBinding = (distanceFromEdge: (point: Vector3) => number, width: number) => {
    const foldedEdge = (point: Vector3) => {
      const across = MathUtils.clamp(distanceFromEdge(point) / width, 0, 1);
      return clearance + .0003 + .00035 * Math.sin(across * Math.PI);
    };
    return fitWardrobeSurface(source, [...boundaries, point => width - distanceFromEdge(point)], foldedEdge);
  };
  return { fabric, topBinding: traceBinding(belowTop, topWidth), hemBinding: traceBinding(aboveHem, hemWidth) };
}

function cutInputs(source: BufferGeometry) {
  return [source.getIndex(), source.getAttribute("position"), source.getAttribute("normal"),
    source.getAttribute("skinIndex"), source.getAttribute("skinWeight")].map(attribute => ({
    attribute,
    version: attribute && ("data" in attribute ? attribute.data.version : attribute.version),
  }));
}

const cutsByDonor = new WeakMap<BufferGeometry, {
  inputs: ReturnType<typeof cutInputs>;
  cuts: Map<UnderwearStyle, UnderwearCut | undefined>;
}>();

function underwearCut(source: BufferGeometry, style: UnderwearStyle) {
  const inputs = cutInputs(source);
  let cached = cutsByDonor.get(source);
  if (!cached || cached.inputs.some(({ attribute, version }, i) =>
    attribute !== inputs[i].attribute || version !== inputs[i].version)) {
    cached = { inputs, cuts: new Map() };
    cutsByDonor.set(source, cached);
  }
  if (!cached.cuts.has(style)) {
    cached.cuts.set(style, traceUnderwear(source, style));
  }
  return cached.cuts.get(style);
}

/** Trace opaque fabric and its binding from the same rig as the restored skin. */
export function prepareWardrobeUnderwear(body: SkinnedMesh, pieces: { bra: boolean; briefs: false | "under-skirt" | "standalone" }) {
  // The live body receives a changing skin mask. Build each cut from the intact donor.
  const source = body.geometry;
  const group = new Group();
  group.name = "wardrobe-underwear";
  const materials = new Map<UnderwearPiece, { fabric: MeshStandardMaterial; binding: MeshStandardMaterial }>();

  function makePiece(style: UnderwearStyle) {
    const cut = underwearCut(source, style);
    if (!cut) return;
    const piece = style === "briefs" ? "briefs" : "bra";

    let palette = materials.get(piece);
    if (!palette) {
      const fabric = new MeshStandardMaterial({ name: "MAT_WARDROBE_UNDERWEAR", color: DEFAULT_UNDERWEAR_COLORS.color, roughness: .9, side: DoubleSide });
      fabric.userData.color_slot = "fabric";
      const binding = new MeshStandardMaterial({ name: "MAT_WARDROBE_UNDERWEAR_BINDING", color: DEFAULT_UNDERWEAR_COLORS.accent, roughness: .87, side: DoubleSide });
      binding.userData.color_slot = "accent";
      palette = { fabric, binding };
      materials.set(piece, palette);
    }
    const item = new Group();
    item.name = `wardrobe-underwear-${piece}${style === "push-up" ? "-push-up" : ""}`;
    item.userData.clothingPiece = piece;
    function addMesh(label: string, geometry: BufferGeometry | undefined, material: MeshStandardMaterial) {
      if (!geometry) return;
      const mesh = body.clone(false);
      mesh.name = `${item.name}-${label}`;
      mesh.userData = { clothingPiece: piece };
      // The template stays on the CPU. Each preview owns its render buffers.
      mesh.geometry = geometry.clone();
      mesh.material = material;
      mesh.frustumCulled = false;
      item.add(mesh);
    }
    addMesh("fabric", cut.fabric, palette.fabric);
    addMesh("top-binding", cut.topBinding, palette.binding);
    addMesh("hem-binding", cut.hemBinding, palette.binding);
    group.add(item);
    return item;
  }

  const bra = pieces.bra ? makePiece("classic") : undefined;
  const briefs = pieces.briefs ? makePiece("briefs") : undefined;
  let pushUp: Group | null | undefined;
  return {
    group, bra, briefs,
    setBraStyle(style?: BraStyle) {
      if (pieces.bra && style === "push-up" && pushUp === undefined) {
        pushUp = makePiece("push-up") ?? null;
      }
      const active = style === "push-up" ? pushUp ?? bra : style === "classic" ? bra : undefined;
      if (bra) bra.visible = active === bra;
      if (pushUp) pushUp.visible = active === pushUp;
      return active;
    },
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
