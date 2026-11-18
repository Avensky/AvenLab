import { BufferAttribute, type BufferGeometry, Color, Group, MathUtils, SkinnedMesh, Vector3, type Material, type Object3D, type Skeleton } from "three";
import type { MeshBVH } from "three-mesh-bvh";
import type { CharacterLook } from "./characterCatalog";
import { clothingColors, clothingPieceFor, skirtUsesUnderwear, underwearColors, type ClothingPiece } from "./clothingPieces";
import { prepareGothicSkirtFit } from "./gothicSkirtFit";
import { isLacedShoulder, prepareLacedBodiceVillageWaist, showsTuckedLacingSkin } from "./lacedStrapFit";
import { prepareShortSkirtFit } from "./shortSkirtFit";
import { prepareSockSkirtFit } from "./sockSkirtFit";
import { prepareShoelessSockFit } from "./wardrobeSocksFit";
import type { StandaloneCorset } from "./standaloneCorset";
import { wardrobeGarmentReplacements, wardrobeRemovalPieces, wardrobeReplacedPieces, type getWardrobeGarment, type WardrobeGarmentSlot, type WardrobeRemoval } from "./wardrobeGarments";
import { prepareWardrobeTopFit } from "./wardrobeTopFit";
import { WARDROBE_WAIST_OPTIONS } from "./wardrobe";
import { prepareVillageBonnet } from "./villageBonnet";
import { fitVillageBraidOverCollar } from "./villageBraid";
import { prepareVillageShoes } from "./wardrobeShoes";
import { prepareWardrobeCoverage, wardrobeCoverageSurface as bodySurface } from "./wardrobeCoverage";
import { insideBraNeckline, prepareWardrobeUnderwear, type BraStyle } from "./wardrobeUnderwear";
import { getWardrobeActorBody, isWardrobeBodyDonor, sharesWardrobeRig } from "./wardrobeBody";

export type WardrobeGarmentSource = { item: NonNullable<ReturnType<typeof getWardrobeGarment>>; scene: Object3D; authoredFit?: boolean };

export function replacesVillagerBody(slot: WardrobeGarmentSlot) {
  return slot === "top" || slot === "skirt" || slot === "dress";
}

export function removalNeedsVillagerBody(slot: WardrobeRemoval) {
  return slot === "top" || slot === "corset" || slot === "skirt" || slot === "shoes" || slot === "dress"
    || slot === "sleeves" || slot === "underskirt" || slot === "village-skirt";
}

/** Imported Vesper garments are authored in the same bind space as the actor. */
export function bindWardrobeGarmentMesh(source: SkinnedMesh, skeleton: Skeleton) {
  if (!sharesWardrobeRig(source, skeleton)) return;
  const mesh = source.clone(false);
  mesh.bind(skeleton, source.bindMatrix);
  mesh.frustumCulled = false;
  return mesh;
}

function wardrobeMeshCandidates({ item, scene }: WardrobeGarmentSource, removeSleeves: boolean) {
  const source = item.villageNode ? scene.getObjectByName(item.villageNode) : scene;
  const candidates: { part: SkinnedMesh; lining: boolean }[] = [];
  source?.traverse(part => {
    if (!(part instanceof SkinnedMesh)) return;
    if (removeSleeves && item.detachableSleeves && /_SLEEVE(?:_|$)/.test(part.name)) return;
    if (!Array.isArray(part.material) && part.material.userData.runtimeExclude) return;
    const data = { ...part.parent?.userData, ...part.userData };
    // These wrap skirts open at the center during normal movement.
    const lining = data.wardrobeRole === "shorts";
    if (lining && !item.outfit && item.id !== "skirt-01" && item.id !== "skirt-02") return;
    candidates.push({ part, lining });
  });
  return candidates;
}

export function hasBindableWardrobeGarment(source: WardrobeGarmentSource, skeleton: Skeleton, removeSleeves = false) {
  return wardrobeMeshCandidates(source, removeSleeves).some(({ part }) => sharesWardrobeRig(part, skeleton));
}

function tintChannel(material: Material, mesh: SkinnedMesh) {
  const data = material.userData;
  return String(data.tintChannel ?? data.color_slot ?? mesh.userData.wardrobePart ?? "fabric");
}

function isFabric(mesh: SkinnedMesh) {
  return !Array.isArray(mesh.material) && !mesh.material.transparent
    && !/hardware|ornament|buttons|buckle|^laces$|^closure$/.test(tintChannel(mesh.material, mesh));
}

const coversSkin = new Set<ClothingPiece>(["corset", "shirt", "sleeves", "skirt", "underskirt", "shorts", "shoes", "socks", "dress"]);
const coversTorso = new Set<ClothingPiece>(["corset", "shirt", "sleeves", "dress", "armor"]);
const MAX_SHARED_FITTED_MASKS = 8;

type RestoredSkin = { upper: boolean; arms: boolean; skirt: boolean; feet: boolean };
type SkinCover = { surface: MeshBVH; piece: ClothingPiece; baseLayer?: true; opening?: (point: Vector3) => boolean };
type TriangleCoverage = (center: Vector3, a: Vector3, b: Vector3, c: Vector3) => boolean;

function captureSurface(geometry: BufferGeometry) {
  const index = geometry.getIndex();
  const position = geometry.getAttribute("position");
  const { start, count } = geometry.drawRange;
  return { geometry, index, position, start, count, indexVersion: index?.version,
    positionVersion: position && ("data" in position ? position.data.version : position.version) };
}

type SurfaceInput = ReturnType<typeof captureSurface>;
type VillageWaistFit = {
  body: SurfaceInput; skirt: SurfaceInput; explicit: boolean;
  adjustments?: Float32Array;
  skin?: { original: SurfaceInput; masks: Map<string, Uint32Array> };
};

function sameSurface(a: SurfaceInput, b: SurfaceInput) {
  return a.geometry === b.geometry && a.index === b.index && a.position === b.position
    && a.start === b.start && a.count === b.count && a.indexVersion === b.indexVersion && a.positionVersion === b.positionVersion;
}

type BaselineMatches = { donor: SurfaceInput; original: SurfaceInput; triangles: Int8Array };
const baselineByDonor = new WeakMap<BufferGeometry, WeakMap<BufferGeometry, BaselineMatches>>();

function baselineTriangleMatches(full: BufferGeometry, cut: BufferGeometry) {
  let byOriginal = baselineByDonor.get(full);
  if (!byOriginal) baselineByDonor.set(full, byOriginal = new WeakMap());
  const donor = captureSurface(full), original = captureSurface(cut);
  const saved = byOriginal.get(cut);
  if (saved && sameSurface(donor, saved.donor) && sameSurface(original, saved.original)) return saved.triangles;
  const triangles = new Int8Array(Math.ceil(donor.index!.count / 3));
  byOriginal.set(cut, { donor, original, triangles });
  return triangles;
}

const villageWaistFits = new WeakMap<Object3D, VillageWaistFit[]>();

function villageWaistFit(source: Object3D, donor: BufferGeometry, waistband: BufferGeometry, explicit: boolean) {
  const body = captureSurface(donor), skirt = captureSurface(waistband);
  let fits = villageWaistFits.get(source);
  if (!fits) villageWaistFits.set(source, fits = []);
  const existing = fits.find(fit => fit.explicit === explicit && sameSurface(fit.body, body) && sameSurface(fit.skirt, skirt));
  if (existing) return existing;
  const fit: VillageWaistFit = { body, skirt, explicit };
  // Cache CPU samples. Each actor owns its fitted geometry and GPU index buffer.
  if (fits.length >= 8) fits.shift();
  fits.push(fit);
  return fit;
}

// Raising the arms can uncover skin along the outer edge of either cup.
function isOuterCupOpening(point: Vector3) {
  return point.z > .10 && Math.abs(point.x) > .075 && point.y > 1.245;
}

function isUnderbustOpening(point: Vector3) {
  // Vesper bind space. The inner armhole curves forward below the upper edge.
  const underarm = point.y > 1.234 && Math.abs(point.x) > .10 && point.z > -.05 && point.z < .065;
  return point.y > 1.270 || isOuterCupOpening(point)
    || underarm || (point.z < 0 && point.y > 1.215 && (point.y > 1.240 || Math.abs(point.x) < .10));
}

function isTop03Armhole(point: Vector3) {
  // In Vesper's bind space the opening starts under the arm and curves inward
  // over the shoulder. Skin in this band can emerge when the arm moves.
  const innerEdge = MathUtils.lerp(.088, .075, MathUtils.smoothstep(point.y, 1.32, 1.35));
  return point.y > 1.25 && Math.abs(point.x) > innerEdge && point.z > -.092 && point.z < .073;
}

function isTop04Armhole(point: Vector3) {
  // Preserve the moving armhole and the skin immediately beneath the standing collar.
  const armhole = point.y > 1.22 && point.y < 1.4 && Math.abs(point.x) > .078;
  const collar = point.y >= 1.4 && point.y < 1.45;
  return armhole || collar;
}

function isTop05SideOpening(point: Vector3) {
  return Math.abs(point.x) > .102 && point.y > 1.226 && point.y < 1.265
    && point.z > -.012 && point.z < .072;
}

const shirtOpenings = new Map([["top-03", isTop03Armhole], ["top-04", isTop04Armhole], ["top-05", isTop05SideOpening]]);

function isStrapOpening(point: Vector3) {
  // Vesper bind space. The narrow strap roots and armholes move relative to
  // the body, so their cloth cannot guarantee coverage through an emote.
  const underarm = point.y > 1.245 && Math.abs(point.x) > .09 && point.z > -.06 && point.z < .065;
  return point.y > 1.265 || underarm;
}

function isAuthoredLacedBodiceOpening(point: Vector3) {
  // Preserve the skin between the back panels down to the lowest eyelets,
  // and underneath the front neckline as the upper body leans or stretches.
  const side = Math.abs(point.x);
  const backLacing = point.z < -.035 && side < .08 && point.y > 1.145;
  const frontOpening = showsTuckedLacingSkin(point) || (point.z > .10 && side < .04 && point.y > 1.245);
  return isStrapOpening(point) || backLacing || frontOpening || isOuterCupOpening(point);
}

function isHighCollarOpening(point: Vector3) {
  // The rear lacing and front keyhole can reveal skin below the strap roots.
  const x = Math.abs(point.x);
  return isStrapOpening(point)
    || (point.z < -.02 && x > .068 && point.y > 1.213)
    || (x > .100 && point.z < .080 && point.y > 1.185)
    || (x > .074 && point.z > .080 && point.y > 1.256)
    || (point.z > .080 && x < .048 && point.y > 1.188);
}

function armVertices(body: SkinnedMesh, geometry: BufferGeometry) {
  const joints = geometry.getAttribute("skinIndex"), weights = geometry.getAttribute("skinWeight");
  const armBones = body.skeleton.bones.map(({ name }) => /^(?:clavicle|upperarm|lowerarm|hand)_/.test(name));
  const arms = new Uint8Array(joints.count);
  for (let i = 0; i < joints.count; i++) {
    let influence = 0;
    for (let channel = 0; channel < joints.itemSize; channel++) {
      if (armBones[joints.getComponent(i, channel)]) influence += weights.getComponent(i, channel);
    }
    if (influence >= .5) arms[i] = 1;
  }
  return arms;
}

// A zero byte means the outer clothing or original body cut already hides this triangle.
const KEEP_SKIN = 1;
const CHECK_BRA = 2;
type BodyMaskCache = {
  masks: Map<string, Uint32Array>; key: string; limit: number;
  clothByWaist?: Map<string, Uint8Array>; waist: string;
};

function rememberMask<T>(masks: Map<string, T>, key: string, mask: T, limit: number) {
  if (masks.size >= limit) {
    const oldest = masks.keys().next().value;
    if (oldest !== undefined) masks.delete(oldest);
  }
  masks.set(key, mask);
}

function fitBodyMask(
  body: SkinnedMesh, original: SkinnedMesh, full: BufferGeometry, top: boolean, skirt: boolean,
  restored: RestoredSkin, clothes: SkinCover[], coveredBra: TriangleCoverage | undefined,
  checkTopEdges: boolean, lacedBodice: "tucked" | "over" | undefined,
  strapOpening: ((point: Vector3) => boolean) | undefined, ruffledSourceFit: boolean, cache?: BodyMaskCache,
) {
  const fittedIndex = body.geometry.getIndex()!;
  const saved = cache?.masks.get(cache.key);
  if (saved) {
    fittedIndex.array.set(saved);
    fittedIndex.needsUpdate = true;
    body.geometry.setDrawRange(0, saved.length);
    return;
  }
  const position = full.getAttribute("position"), index = full.getIndex()!;
  const a = new Vector3(), b = new Vector3(), c = new Vector3(), point = new Vector3();
  function sampleTriangle(ai: number, bi: number, ci: number) {
    a.fromBufferAttribute(position, ai);
    b.fromBufferAttribute(position, bi);
    c.fromBufferAttribute(position, ci);
    point.copy(a).add(b).add(c).multiplyScalar(1 / 3);
  }
  function finish(visible: number) {
    fittedIndex.needsUpdate = true;
    body.geometry.setDrawRange(0, visible);
    if (cache) rememberMask(cache.masks, cache.key, new Uint32Array(fittedIndex.array.subarray(0, visible)), cache.limit);
  }
  const previousCloth = cache?.clothByWaist?.get(cache.waist);
  if (previousCloth) {
    let visible = 0;
    for (let i = 0; i < index.count; i += 3) {
      const state = previousCloth[i / 3];
      if (!state) continue;
      const ai = index.getX(i), bi = index.getX(i + 1), ci = index.getX(i + 2);
      if (state === CHECK_BRA && coveredBra) {
        sampleTriangle(ai, bi, ci);
        if (coveredBra(point, a, b, c)) continue;
      }
      fittedIndex.array[visible++] = ai;
      fittedIndex.array[visible++] = bi;
      fittedIndex.array[visible++] = ci;
    }
    finish(visible);
    return;
  }

  const cloth = cache?.clothByWaist ? new Uint8Array(Math.ceil(index.count / 3)) : undefined;
  const baselineDistance = .0016;
  let baseline: MeshBVH | null | undefined;
  let baselineMatches: Int8Array | undefined;
  const hit = { point: new Vector3(), distance: 0, faceIndex: 0 };
  const surfaces = clothes.map(({ surface }) => surface);
  const covered = prepareWardrobeCoverage(surfaces);
  const coveredShoulder = lacedBodice && prepareWardrobeCoverage(surfaces, .001);
  const coveredWithoutCorset = strapOpening || ruffledSourceFit
    // A separate high-waisted skirt can sit within the coverage tolerance of
    // the open keyhole without actually covering the exposed torso.
    ? prepareWardrobeCoverage(clothes.filter(({ piece }) => piece !== "corset"
      && (strapOpening !== isHighCollarOpening || coversTorso.has(piece))).map(({ surface }) => surface))
    : undefined;
  const torsoClothes = restored.upper ? clothes.filter(({ piece, baseLayer }) => baseLayer || coversTorso.has(piece)) : clothes;
  const coveredTorso = restored.upper
    ? prepareWardrobeCoverage(torsoClothes.map(({ surface }) => surface))
    : covered;
  // The selectable top or corset owns this opening; other layers can still mask it.
  const opening = torsoClothes.find(cover => cover.opening)?.opening;
  const coveredOpenings = opening
    ? prepareWardrobeCoverage(torsoClothes.filter(cover => cover.opening !== opening).map(({ surface }) => surface))
    : undefined;
  const arms = restored.arms ? armVertices(body, full) : undefined;
  let visible = 0;
  for (let i = 0; i < index.count; i += 3) {
    const ai = index.getX(i), bi = index.getX(i + 1), ci = index.getX(i + 2);
    sampleTriangle(ai, bi, ci);
    const upperBody = point.y > 1.10 || (point.y > .87 && Math.abs(point.x) > .17);
    // The long corset and high-waisted skirt overlap the usual upper/lower
    // split. Restore both sides of that seam and let the remaining cloth mask it.
    const restoredTorso = restored.upper && point.y > .92;
    const restoredArms = arms && (arms[ai] || arms[bi] || arms[ci]);
    const restoredSkin = Boolean(restoredTorso || restoredArms)
      || (restored.skirt && point.y > .075 && point.y < 1.24)
      || (restored.feet && point.y < .115);
    const replaced = restoredSkin || (upperBody ? top : skirt && point.y > .075);
    const openLacing = lacedBodice === "tucked" && showsTuckedLacingSkin(point);
    if (!openLacing && !replaced) {
      // Each donor triangle has the same distance to the original cut across outfits.
      // Zero means untested. Query only when an outfit needs this triangle.
      baselineMatches ??= baselineTriangleMatches(full, original.geometry);
      const triangle = i / 3;
      if (baselineMatches[triangle] === 0) {
        if (baseline === undefined) baseline = bodySurface(original.geometry) ?? null;
        baselineMatches[triangle] = baseline?.closestPointToPoint(point, hit, baselineDistance, baselineDistance) ? 1 : -1;
      }
      if (baselineMatches[triangle] < 0) continue;
    }
    // A strap or neckline can cross the middle of a skin triangle. Keep the
    // skin at that edge unless the fabric covers the face and its corners.
    // Keep the exposed torso intact through pose changes at the skirt waist.
    // The rebuilt vest's narrow edges can expose parts of an otherwise masked
    // triangle as the actor moves. Leave skin under these edges and still mask
    // it against any separately equipped layer.
    // The strapless rim can reveal the upper torso when Vesper turns or leans.
    const ruffledRim = ruffledSourceFit && Math.max(a.y, b.y, c.y) >= 1.15;
    const isCovered = coveredWithoutCorset && (ruffledRim || strapOpening?.(point)) ? coveredWithoutCorset
      : coveredOpenings && opening?.(point) ? coveredOpenings
      : coveredShoulder && isLacedShoulder(point) ? coveredShoulder : restoredTorso && !restoredArms ? coveredTorso : covered;
    const canMask = !openLacing && replaced;
    if (canMask && isCovered(point, a, b, c, restoredSkin || (upperBody && checkTopEdges))) continue;
    if (cloth) cloth[i / 3] = canMask ? CHECK_BRA : KEEP_SKIN;
    if (canMask && coveredBra?.(point, a, b, c)) continue;
    fittedIndex.array[visible++] = ai;
    fittedIndex.array[visible++] = bi;
    fittedIndex.array[visible++] = ci;
  }
  if (cloth && cache?.clothByWaist) rememberMask(cache.clothByWaist, cache.waist, cloth, WARDROBE_WAIST_OPTIONS.length);
  finish(visible);
  baseline?.geometry.dispose();
}

export function prepareWardrobeGarments(
  root: Object3D, sources: readonly WardrobeGarmentSource[], fullBody?: Object3D, corset?: StandaloneCorset,
  removedClothing: readonly WardrobeRemoval[] = [],
) {
  const original = getWardrobeActorBody(root);
  if ((!sources.length && !corset && !removedClothing.length) || !original) return;
  const full = isWardrobeBodyDonor(fullBody, original.skeleton) ? fullBody.geometry : undefined;
  const stock: { part: Object3D; piece: ClothingPiece }[] = [];
  root.traverse(part => {
    const piece = clothingPieceFor(part);
    if (piece) stock.push({ part, piece });
  });
  // A cut outfit cannot safely expose its skin when its body donor is unavailable.
  const removals = removedClothing.filter(slot => (full || !removalNeedsVillagerBody(slot))
    && (((slot === "top" || slot === "skirt") && removedClothing.includes("dress"))
      || wardrobeRemovalPieces[slot].some(piece => stock.some(part => part.piece === piece))));
  const exposesTop = removals.includes("top") || removals.includes("corset");
  const exposesBottom = removals.includes("skirt") || removals.includes("village-skirt");
  const removeSleeves = Boolean(full) && removedClothing.includes("sleeves");
  const restored = {
    upper: exposesTop,
    arms: removals.includes("dress") || (removeSleeves && (removals.includes("sleeves") || sources.some(({ item }) => item.detachableSleeves))),
    skirt: exposesBottom || removals.includes("underskirt"), feet: removals.includes("shoes"),
  };
  const restoresBody = restored.upper || restored.arms || restored.skirt || restored.feet;
  const replacements = new Set<ClothingPiece>(removals.flatMap(slot => wardrobeRemovalPieces[slot]));
  const group = new Group();
  group.name = "fitting-room-garments";
  const materials = new Map<ClothingPiece, { base: Color; color: Color; accent: boolean }[]>();
  const ownedMaterials = new Set<Material>();
  const fittedGarments: BufferGeometry[] = [];
  const tallSocks: SkinnedMesh[] = [];
  let villageBonnet: ReturnType<typeof prepareVillageBonnet>;
  let disposeVillageShoes: ReturnType<typeof prepareVillageShoes>;
  let villageBodySwap = false;
  let checkTopEdges = Boolean(corset);
  const fitVillageWaist = Boolean(corset?.authoredLacedBodice || corset?.sweetheartSkin);
  const shapes: SkinCover[] = [];
  const shortSkirtSurfaces: MeshBVH[] = [];
  const villageSkirtSurfaces: MeshBVH[] = [];
  const villageSkirtMeshes: SkinnedMesh[] = [];
  const villageBeltMeshes: SkinnedMesh[] = [];
  const tuckedSkirtSurfaces: MeshBVH[] = [];
  const fittedShapes = new Map<string, SkinCover[]>();
  // The Village body's bind-space coverage is fixed for the prepared actor.
  // Bundled outfits can change their source body indices with the fit.
  const fixedBody = original.name === "BODY_OUTFIT_CUT" && !original.geometry.getAttribute("_aven_coverage");
  let fittedMasks: Map<string, Uint32Array> | undefined;
  if (corset) {
    group.add(corset.group);
    for (const piece of wardrobeGarmentReplacements.top) replacements.add(piece);
  }
  let upperGarment = false, skirt = false, skirtNeedsBriefs = false;
  let tucksHair = false;
  let scalpCap = false;
  let skirtRadius: number | undefined;
  for (const { item, scene, authoredFit } of sources) {
    if (replacesVillagerBody(item.slot) && !full?.getIndex()) continue;
    const fitTop = item.slot === "top" && item.piece === "shirt" && full ? prepareWardrobeTopFit(full, item.id, original.skeleton) : undefined;
    const fitShortSkirt = item.slot === "skirt" ? prepareShortSkirtFit(item.id) : undefined;
    const garment = new Group();
    garment.name = `wardrobe-${item.id}`;
    garment.userData.clothingPiece = item.piece;
    const liningColors: Color[] = [];
    const garmentMeshes: SkinnedMesh[] = [];
    let fabricColor: Color | undefined;
    for (const { part, lining } of wardrobeMeshCandidates({ item, scene }, removeSleeves)) {
      const mesh = bindWardrobeGarmentMesh(part, original.skeleton);
      if (!mesh) continue;
      mesh.userData.clothingPiece = item.piece;
      if (lining) mesh.userData.wardrobeRole = "shorts";
      const cloneMaterial = (source: Material) => {
        const material = source.clone();
        const channel = tintChannel(source, mesh);
        ownedMaterials.add(material);
        if ("color" in material && material.color instanceof Color) {
          const base = material.color.clone();
          if (lining) liningColors.push(base);
          else if (channel === "fabric") fabricColor ??= base;
          let palette = materials.get(item.piece);
          if (!palette) materials.set(item.piece, palette = []);
          palette.push({ base, color: material.color, accent: !lining && channel !== "fabric" });
        }
        return material;
      };
      mesh.material = Array.isArray(part.material) ? part.material.map(cloneMaterial) : cloneMaterial(part.material);
      if (item.id === "village-belt" && fitVillageWaist) villageBeltMeshes.push(mesh);
      garmentMeshes.push(mesh);
      garment.add(mesh);
    }
    if (!garmentMeshes.length) continue;
    if (item.villageNode) {
      villageBodySwap ||= replacesVillagerBody(item.slot);
      if (item.slot === "hat") villageBonnet = prepareVillageBonnet(garment.getObjectByName(item.villageNode));
      if (item.slot === "shoes") disposeVillageShoes = prepareVillageShoes(garment);
    }
    if (item.slot === "hat") {
      tucksHair ||= Boolean(item.tucksHair);
      scalpCap ||= Boolean(item.scalpCap);
    }
    if (item.id === "socks-04") tallSocks.push(...garmentMeshes);
    const skirtBody = full && !authoredFit && item.slot === "skirt" && item.id.startsWith("gothic-skirt-") ? bodySurface(full) : undefined;
    const skirtSurfaces = skirtBody ? garmentMeshes.filter(isFabric).flatMap(mesh => bodySurface(mesh.geometry) ?? []) : [];
    const fitSkirt = skirtBody && skirtSurfaces.length ? prepareGothicSkirtFit(skirtBody, skirtSurfaces, item.id, original.skeleton) : undefined;
    const sockBody = item.slot === "socks" && restored.feet && full ? bodySurface(full) : undefined;
    const fitSocks = sockBody && prepareShoelessSockFit(sockBody);
    for (const { geometry } of skirtSurfaces) geometry.dispose();
    for (const mesh of garmentMeshes) {
      const lining = mesh.userData.wardrobeRole === "shorts";
      const fit = fitTop ?? fitSkirt ?? fitSocks ?? (lining ? undefined : fitShortSkirt);
      const fitted = fit?.(mesh.geometry);
      if (fitted) {
        mesh.geometry = fitted;
        fittedGarments.push(fitted);
      }
      const coversRestoredSkin = restoresBody && (coversSkin.has(item.piece) || (restored.arms && item.piece === "coat"));
      if ((replacesVillagerBody(item.slot) || coversRestoredSkin) && isFabric(mesh)) {
        const surface = bodySurface(mesh.geometry);
        if (surface) {
          shapes.push({ surface, piece: item.piece, opening: shirtOpenings.get(item.id) });
          if (fitShortSkirt && !lining && corset?.fitSkirt && !corset.sweetheartSkin) shortSkirtSurfaces.push(surface);
          if (item.id === "village-skirt" && fitVillageWaist) {
            villageSkirtSurfaces.push(surface);
            villageSkirtMeshes.push(mesh);
          }
          if (item.slot === "skirt" && !lining && corset?.fitTuckedHardware) tuckedSkirtSurfaces.push(surface);
        }
      }
      if (item.slot === "skirt" || item.slot === "dress") {
        const position = mesh.geometry.getAttribute("position"), point = new Vector3();
        for (let i = 0; i < position.count; i++) {
          point.fromBufferAttribute(position, i);
          if (point.y > .73 && point.y < 1.04) skirtRadius = Math.max(skirtRadius ?? 0, Math.abs(point.x));
        }
      }
    }
    skirtBody?.geometry.dispose();
    sockBody?.geometry.dispose();
    checkTopEdges ||= item.slot === "top" || Boolean(item.outfit);
    if (fabricColor) for (const color of liningColors) color.copy(fabricColor);
    group.add(garment);
    for (const piece of wardrobeReplacedPieces(item)) replacements.add(piece);
    upperGarment ||= item.slot === "top" || item.slot === "dress";
    skirt ||= item.slot === "skirt" || item.slot === "dress";
    skirtNeedsBriefs ||= skirtUsesUnderwear(item.id);
  }
  let villageTuckedWaist: ReturnType<typeof prepareLacedBodiceVillageWaist> | undefined;
  if (shortSkirtSurfaces.length) corset?.fitSkirt?.(shortSkirtSurfaces);
  else if (fitVillageWaist && corset?.fitSkirt) {
    const stockSkirt = !replacements.has("skirt")
      ? root.getObjectByName("CLOTH_BOTTOM_SKIRT") : undefined;
    const stockSurfaces: MeshBVH[] = [];
    stockSkirt?.traverse(part => {
      if (!(part instanceof SkinnedMesh) || Array.isArray(part.material) || part.material.name !== "MAT_ClothLower") return;
      const index = part.geometry.getIndex();
      const { start, count } = part.geometry.drawRange;
      if (index && count > 0 && start < index.count) villageSkirtMeshes.push(part);
    });
    const explicitSkirt = villageSkirtSurfaces.length > 0;
    const cache = full && corset.villageWaistSource && villageSkirtMeshes.length === 1
      ? villageWaistFit(corset.villageWaistSource, full, villageSkirtMeshes[0].geometry, explicitSkirt)
      : undefined;
    if (!villageSkirtSurfaces.length && !cache?.adjustments) {
      for (const mesh of villageSkirtMeshes) {
        const surface = bodySurface(mesh.geometry);
        if (surface) stockSurfaces.push(surface);
      }
    }
    const villageSkirt = villageSkirtSurfaces.length ? villageSkirtSurfaces : stockSurfaces;
    if (villageSkirt.length || cache?.adjustments) {
      if (!replacements.has("belt")) root.getObjectByName("ACC_BELT")?.traverse(part => {
        if (part instanceof SkinnedMesh) villageBeltMeshes.push(part);
      });
      corset.fitSkirt(villageSkirt, { hasBelt: villageBeltMeshes.some(mesh => mesh.visible) }, cache);
      villageTuckedWaist = prepareLacedBodiceVillageWaist(
        villageSkirtMeshes, villageBeltMeshes, corset.sweetheartSkin);
      // Belts and other layers can affect coverage without changing the
      // waistband samples. Share masks only for the original Laced cases.
      if (cache && corset.authoredLacedBodice && fixedBody && !removedClothing.length
        && (!sources.length || (sources.length === 1 && sources[0].item.id === "village-skirt" && explicitSkirt))) {
        const sourceBody = captureSurface(original.geometry);
        if (!cache.skin || !sameSurface(cache.skin.original, sourceBody)) {
          cache.skin = { original: sourceBody, masks: new Map() };
        }
        fittedMasks = cache.skin.masks;
      }
    }
    for (const { geometry } of stockSurfaces) geometry.dispose();
  }
  if (tuckedSkirtSurfaces.length) corset?.fitTuckedHardware?.(tuckedSkirtSurfaces);
  const ruffledTucked = corset?.group.getObjectByName("CLOTH_CORSET_TUCKED");
  let villageBelt: { mesh: SkinnedMesh; original: BufferGeometry; tucked: BufferGeometry } | undefined;
  if (ruffledTucked?.userData.ruffledSourceFit === true && (
    group.getObjectByName("wardrobe-village-skirt")
    || (original.name === "BODY_OUTFIT_CUT" && !replacements.has("skirt") && root.getObjectByName("CLOTH_BOTTOM_SKIRT"))
  )) {
    const belt = !replacements.has("belt") && root.getObjectByName("ACC_BELT");
    if (belt instanceof SkinnedMesh) {
      const original = belt.geometry;
      const tucked: BufferGeometry = original.clone();
      const position = tucked.getAttribute("position");
      for (let i = 0; i < position.count; i++) {
        const x = position.getX(i), y = position.getY(i), depth = position.getZ(i) - .025;
        const radius = Math.hypot(x, depth);
        if (!radius) continue;
        const rear = MathUtils.smoothstep(-depth / radius, -.50, .36);
        const room = rear * MathUtils.lerp(.003, .016, MathUtils.smoothstep(y, 1.099, 1.131));
        position.setXYZ(i, x * (1 + room / radius), y, .025 + depth * (1 + room / radius));
      }
      tucked.computeBoundingBox();
      tucked.computeBoundingSphere();
      villageBelt = { mesh: belt, original, tucked };
      fittedGarments.push(tucked);
    }
    const waistband = belt ? 1.113 : 1.096;
    const waistFade = belt ? 1.139 : 1.119;
    // Roll the lower side and rear panels under the Village waistband.
    ruffledTucked.traverse(mesh => {
      if (!(mesh instanceof SkinnedMesh)) return;
      const fitted = mesh.geometry.clone();
      const position = fitted.getAttribute("position");
      for (let i = 0; i < position.count; i++) {
        const x = position.getX(i), y = position.getY(i), depth = position.getZ(i) - .025;
        const radius = Math.hypot(x, depth);
        if (!radius || y >= waistFade) continue;
        const rear = MathUtils.smoothstep(-depth / radius, -.49, .36);
        const inset = .027 * rear * (1 - MathUtils.smoothstep(y, waistband, waistFade));
        const scale = 1 - inset / radius;
        position.setX(i, x * scale);
        position.setZ(i, .025 + depth * scale);
      }
      fitted.computeBoundingBox();
      fitted.computeBoundingSphere();
      mesh.geometry = fitted;
      fittedGarments.push(fitted);
    });
  }
  if (!group.children.length && !replacements.size) return;
  const collarBraid = !tucksHair && group.getObjectByName("wardrobe-top-03") ? root.getObjectByName("HAIR_HAIR20") : undefined;
  let restoreBraid: ReturnType<typeof fitVillageBraidOverCollar>;
  // The High Collar's over fit encloses Vesper's entire Village belt.
  const coveredBelt = corset?.updateShoulders
    ? group.getObjectByName("wardrobe-village-belt") ?? (replacements.has("belt") ? undefined : root.getObjectByName("ACC_BELT"))
    : undefined;
  const beltWasVisible = coveredBelt?.visible;
  const top = Boolean(corset) || upperGarment;
  const body = (top || skirt || restoresBody) && full && fullBody instanceof SkinnedMesh ? bindWardrobeGarmentMesh(fullBody, original.skeleton) : undefined;
  const stockBodice = stock.some(({ piece }) => (piece === "corset" || piece === "shirt") && !replacements.has(piece));
  const bra = (exposesTop || Boolean(corset)) && !upperGarment && !stockBodice && (!corset || corset.underbust);
  const briefs = skirtNeedsBriefs ? "under-skirt" : exposesBottom && !skirt && "standalone";
  const underwear = body && (bra || briefs) ? prepareWardrobeUnderwear(body, { bra, briefs }) : undefined;
  const braShapes = new Map<Group, { surfaces: MeshBVH[]; covers: TriangleCoverage }>();
  function underwearSurfaces(piece?: Group) {
    const surfaces: MeshBVH[] = [];
    piece?.traverse(mesh => {
      if (!(mesh instanceof SkinnedMesh) || Array.isArray(mesh.material) || mesh.material.userData.color_slot !== "fabric") return;
      const surface = bodySurface(mesh.geometry);
      if (surface) surfaces.push(surface);
    });
    return surfaces;
  }
  function activeBraCoverage(bra?: Group) {
    if (!bra) return;
    const cached = braShapes.get(bra);
    if (cached) return cached.covers;
    const style = bra === underwear?.bra ? "classic" : "push-up";
    const surfaces = underwearSurfaces(bra);
    const covered = prepareWardrobeCoverage(surfaces, 0, 1);
    // The moving binding can reveal skin even when all three corners
    // intersect its outer lip in the bind pose.
    const covers: TriangleCoverage = (center, a, b, c) => covered(center, a, b, c, true)
      && insideBraNeckline(style, a) && insideBraNeckline(style, b) && insideBraNeckline(style, c);
    braShapes.set(bra, { surfaces, covers });
    return covers;
  }
  if (underwear) {
    group.add(underwear.group);
    for (const surface of underwearSurfaces(underwear.briefs)) shapes.push({ surface, piece: "briefs", baseLayer: true });
  }
  if (body && full) {
    body.name = "fitting-room-body";
    body.material = original.material;
    body.geometry = full.clone().setIndex(new BufferAttribute(new Uint32Array(full.getIndex()!.count), 1));
    group.add(body);
  }
  // Actor-local masks fit all selectable waist and bra combinations. Shared
  // Laced masks keep their separate bound across actors.
  const maskLimit = fittedMasks ? MAX_SHARED_FITTED_MASKS
    : WARDROBE_WAIST_OPTIONS.length * (underwear?.bra ? 3 : 1);
  if (fixedBody && body && (corset || underwear?.bra)) fittedMasks ??= new Map();
  // The visible outer clothing is independent of the selected bra on this actor.
  const clothByWaist = fixedBody && underwear?.bra ? new Map<string, Uint8Array>() : undefined;
  if (skirt) root.userData.skirtHandRoom = MathUtils.clamp((skirtRadius ?? .23) - .23, 0, .12);
  root.add(group);
  let maskedWaist: string | undefined;
  let maskedBra: BraStyle | undefined;
  let socksFitted = false;
  return {
    tucksHair,
    scalpCap,
    apply(look: CharacterLook) {
      if (collarBraid?.visible && !restoreBraid) restoreBraid = fitVillageBraidOverCollar(collarBraid);
      const corsetWaist = look.corset?.waist ?? look.wardrobe?.waist ?? "tucked";
      const waist = `${corset ? corsetWaist : look.wardrobe?.waist ?? "original"}:${look.overEase}`;
      const showBra = Boolean(underwear?.bra) && (look.bra ?? (restored.upper && !corset));
      const braStyle = showBra ? look.appearance.bra_style ?? "classic" : undefined;
      const activeBra = underwear?.setBraStyle(braStyle);
      corset?.apply(corsetWaist, look.overEase);
      villageTuckedWaist?.apply(corsetWaist === "tucked");
      if (villageBelt) villageBelt.mesh.geometry = corsetWaist === "tucked" ? villageBelt.tucked : villageBelt.original;
      villageBonnet?.setBowVisible(!look.removedClothing.includes("bonnet-bow"));
      for (const { part, piece } of stock) if (replacements.has(piece)) part.visible = false;
      if (coveredBelt) coveredBelt.visible = Boolean(beltWasVisible) && corsetWaist === "tucked";
      if (tallSocks.length && !socksFitted) {
        const skirt: MeshBVH[] = [];
        root.traverseVisible(part => {
          if (!(part instanceof SkinnedMesh) || clothingPieceFor(part) !== "skirt" || !isFabric(part)
            || Array.isArray(part.material) || part.material.opacity < .99 || part.material.alphaTest > 0) return;
          const surface = bodySurface(part.geometry);
          if (surface) skirt.push(surface);
        });
        const fit = prepareSockSkirtFit(skirt);
        for (const mesh of tallSocks) {
          const geometry = fit?.(mesh.geometry);
          if (!geometry) continue;
          mesh.geometry = geometry;
          fittedGarments.push(geometry);
        }
        for (const { geometry } of skirt) geometry.dispose();
        socksFitted = true;
      }
      if (body && full && (maskedWaist !== waist || maskedBra !== braStyle)) {
        const maskKey = `${waist}:${braStyle ?? "off"}`;
        let surfaces = fittedShapes.get(waist);
        if ((corset || restoresBody || villageBodySwap) && !surfaces && !fittedMasks?.has(maskKey)) {
          const fittedSurfaces: SkinCover[] = [];
          const addSurface = (part: Object3D, piece: ClothingPiece) => {
            if (!(part instanceof SkinnedMesh) || !isFabric(part)) return;
            const surface = bodySurface(part.geometry);
            if (surface) fittedSurfaces.push({ surface, piece,
              opening: part.userData.rebuiltUnderbust === true ? isUnderbustOpening : undefined });
          };
          // This fitted shell is worn over the full chest and armholes.
          if (corset && !corset.sweetheartSkin) corset.group.traverseVisible(part => addSurface(part, "corset"));
          if (restoresBody || villageBodySwap) {
            for (const { part, piece } of stock) {
              if (!coversSkin.has(piece) && !(restored.arms && piece === "coat")) continue;
              let ancestor: Object3D | null = part;
              while (ancestor?.visible) ancestor = ancestor.parent;
              if (!ancestor) addSurface(part, piece);
            }
          }
          fittedShapes.set(waist, fittedSurfaces);
          surfaces = fittedSurfaces;
        }
        const visibleShapes = [...shapes, ...(surfaces ?? [])];
        const fit = corset?.group.getObjectByName(corsetWaist === "tucked" ? "CLOTH_CORSET_TUCKED" : "CLOTH_CORSET_OVER");
        const strapOpening = corset?.authoredLacedBodice ? isAuthoredLacedBodiceOpening
          : fit?.userData.preserveShoulderSkin === true ? isHighCollarOpening : undefined;
        fitBodyMask(body, original, full, top, skirt, restored, visibleShapes,
          activeBraCoverage(activeBra), checkTopEdges, corset?.group.userData.lacedBodiceStraps ? corsetWaist : undefined,
          strapOpening, ruffledTucked?.userData.ruffledSourceFit === true,
          fittedMasks && { masks: fittedMasks, key: maskKey, limit: maskLimit, clothByWaist, waist });
        maskedWaist = waist;
        maskedBra = braStyle;
      }
      if (body) original.visible = false;
      underwear?.applyColors(piece => underwearColors(look, piece));
      const outfitColor = look.appearance.color !== "original" ? look.fabric : undefined;
      for (const [piece, palette] of materials) {
        const dye = clothingColors(look, piece);
        const fabric = dye?.color ?? outfitColor;
        const trim = dye?.accent ?? look.appearance.accent;
        for (const { color, base, accent } of palette) {
          const tint = accent ? trim : fabric;
          color.copy(base);
          if (tint) color.set(tint);
        }
      }
    },
    dispose() {
      group.removeFromParent();
      if (coveredBelt) coveredBelt.visible = Boolean(beltWasVisible);
      underwear?.dispose();
      body?.geometry.dispose();
      villageBonnet?.dispose();
      restoreBraid?.();
      disposeVillageShoes?.();
      villageTuckedWaist?.dispose();
      if (villageBelt) villageBelt.mesh.geometry = villageBelt.original;
      for (const geometry of fittedGarments) geometry.dispose();
      for (const { surface } of shapes) surface.geometry.dispose();
      for (const { surfaces } of braShapes.values()) for (const { geometry } of surfaces) geometry.dispose();
      for (const surfaces of fittedShapes.values()) for (const { surface } of surfaces) surface.geometry.dispose();
      for (const material of ownedMaterials) material.dispose();
    },
  };
}
