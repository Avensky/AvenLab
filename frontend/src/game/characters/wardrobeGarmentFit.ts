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
import { prepareVillageBonnet } from "./villageBonnet";
import { prepareVillageShoes } from "./wardrobeShoes";
import { prepareWardrobeCoverage, wardrobeCoverageSurface as bodySurface } from "./wardrobeCoverage";
import { prepareWardrobeUnderwear } from "./wardrobeUnderwear";

export type WardrobeGarmentSource = { item: NonNullable<ReturnType<typeof getWardrobeGarment>>; scene: Object3D; authoredFit?: boolean };

export function replacesVillagerBody(slot: WardrobeGarmentSlot) {
  return slot === "top" || slot === "skirt" || slot === "dress";
}

export function removalNeedsVillagerBody(slot: WardrobeRemoval) {
  return slot === "top" || slot === "corset" || slot === "skirt" || slot === "shoes" || slot === "dress"
    || slot === "sleeves" || slot === "underskirt" || slot === "village-skirt";
}

function sharesWardrobeRig(source: SkinnedMesh, skeleton: Skeleton) {
  return source.skeleton.bones.length === skeleton.bones.length
    && source.skeleton.bones.every((bone, i) => bone.name === skeleton.bones[i].name);
}

/** Imported Vesper garments are authored in the same bind space as the actor. */
export function bindWardrobeGarmentMesh(source: SkinnedMesh, skeleton: Skeleton) {
  if (!sharesWardrobeRig(source, skeleton)) return;
  const mesh = source.clone(false);
  mesh.bind(skeleton, source.bindMatrix);
  mesh.frustumCulled = false;
  return mesh;
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

type RestoredSkin = { upper: boolean; arms: boolean; skirt: boolean; feet: boolean };
type SkinCover = { surface: MeshBVH; piece: ClothingPiece; baseLayer?: true; rebuiltUnderbust?: boolean };
type VillageBodiceFit = {
  body: BufferGeometry; original: BufferGeometry; skirt: BufferGeometry; explicit: boolean;
  adjustments?: Float32Array; masks: Map<string, Uint32Array>;
};

const villageBodiceFits = new WeakMap<Object3D, VillageBodiceFit[]>();

function villageBodiceFit(source: Object3D, body: BufferGeometry, original: BufferGeometry, skirt: BufferGeometry, explicit: boolean) {
  let fits = villageBodiceFits.get(source);
  if (!fits) villageBodiceFits.set(source, fits = []);
  const existing = fits.find(fit => fit.body === body && fit.original === original && fit.skirt === skirt && fit.explicit === explicit);
  if (existing) return existing;
  const fit: VillageBodiceFit = { body, original, skirt, explicit, masks: new Map() };
  // Keep only a few recent source combinations. The cached data is CPU-only;
  // each actor still owns and disposes its fitted geometry and index buffers.
  if (fits.length >= 8) fits.shift();
  fits.push(fit);
  return fit;
}

function isUnderbustOpening(point: Vector3) {
  // Vesper bind space. The inner armhole curves forward below the upper edge.
  const underarm = point.y > 1.234 && Math.abs(point.x) > .10 && point.z > -.05 && point.z < .065;
  return point.y > 1.270
    || underarm || (point.z < 0 && point.y > 1.215 && (point.y > 1.240 || Math.abs(point.x) < .10));
}

function isAuthoredLacedBodiceOpening(point: Vector3) {
  // Vesper bind space. The narrow strap roots and armholes move relative to
  // the body, so their cloth cannot guarantee coverage through an emote.
  const underarm = point.y > 1.245 && Math.abs(point.x) > .09 && point.z > -.06 && point.z < .065;
  return point.y > 1.265 || underarm;
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

function fitBodyMask(
  body: SkinnedMesh, original: SkinnedMesh, full: BufferGeometry, top: boolean, skirt: boolean,
  restored: RestoredSkin, clothes: SkinCover[], bra: MeshBVH[], checkTopEdges: boolean, lacedBodice: "tucked" | "over" | undefined,
  authoredLacedBodice: boolean, cache?: { masks: Map<string, Uint32Array>; key: string },
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
  const baseline = bodySurface(original.geometry);
  const a = new Vector3(), b = new Vector3(), c = new Vector3(), point = new Vector3();
  const hit = { point: new Vector3(), distance: 0, faceIndex: 0 };
  const surfaces = clothes.map(({ surface }) => surface);
  const covered = prepareWardrobeCoverage(surfaces);
  const coveredShoulder = lacedBodice && prepareWardrobeCoverage(surfaces, .001);
  const coveredLacedOpenings = authoredLacedBodice
    ? prepareWardrobeCoverage(clothes.filter(({ piece }) => piece !== "corset").map(({ surface }) => surface))
    : undefined;
  const torsoClothes = restored.upper ? clothes.filter(({ piece, baseLayer }) => baseLayer || coversTorso.has(piece)) : clothes;
  const coveredTorso = restored.upper
    ? prepareWardrobeCoverage(torsoClothes.map(({ surface }) => surface))
    : covered;
  const coveredOpenings = torsoClothes.some(({ rebuiltUnderbust }) => rebuiltUnderbust)
    ? prepareWardrobeCoverage(torsoClothes.filter(({ rebuiltUnderbust }) => !rebuiltUnderbust).map(({ surface }) => surface))
    : undefined;
  // The close-fitting bra is offset from the same skin. Keep any body face
  // that extends beyond its binding instead of cutting away its exposed tip.
  const coveredBra = bra.length ? prepareWardrobeCoverage(bra, 0, 1) : undefined;
  const arms = restored.arms ? armVertices(body, full) : undefined;
  let visible = 0;
  for (let i = 0; i < index.count; i += 3) {
    const ai = index.getX(i), bi = index.getX(i + 1), ci = index.getX(i + 2);
    a.fromBufferAttribute(position, ai);
    b.fromBufferAttribute(position, bi);
    c.fromBufferAttribute(position, ci);
    point.copy(a).add(b).add(c).multiplyScalar(1 / 3);
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
    if (!openLacing && !replaced && !baseline?.closestPointToPoint(point, hit, 0, .0016)) continue;
    // A strap or neckline can cross the middle of a skin triangle. Keep the
    // skin at that edge unless the fabric covers the face and its corners.
    // Keep the exposed torso intact through pose changes at the skirt waist.
    // The rebuilt vest's narrow edges can expose parts of an otherwise masked
    // triangle as the actor moves. Leave skin under these edges and still mask
    // it against any separately equipped layer.
    const isCovered = coveredLacedOpenings && isAuthoredLacedBodiceOpening(point) ? coveredLacedOpenings
      : coveredOpenings && isUnderbustOpening(point) ? coveredOpenings
      : coveredShoulder && isLacedShoulder(point) ? coveredShoulder : restoredTorso && !restoredArms ? coveredTorso : covered;
    if (!openLacing && replaced && (isCovered(point, a, b, c, restoredSkin || (upperBody && checkTopEdges))
      || coveredBra?.(point, a, b, c, true))) continue;
    fittedIndex.array[visible++] = ai;
    fittedIndex.array[visible++] = bi;
    fittedIndex.array[visible++] = ci;
  }
  fittedIndex.needsUpdate = true;
  body.geometry.setDrawRange(0, visible);
  if (cache) cache.masks.set(cache.key, new Uint32Array(fittedIndex.array.subarray(0, visible)));
  baseline?.geometry.dispose();
}

export function prepareWardrobeGarments(
  root: Object3D, sources: readonly WardrobeGarmentSource[], fullBody?: Object3D, corset?: StandaloneCorset,
  removedClothing: readonly WardrobeRemoval[] = [],
) {
  const original = root.getObjectByName("BODY_WARDROBE") ?? root.getObjectByName("BODY_OUTFIT_CUT");
  if ((!sources.length && !corset && !removedClothing.length) || !(original instanceof SkinnedMesh)) return;
  const full = fullBody instanceof SkinnedMesh && fullBody.geometry.getIndex() && sharesWardrobeRig(fullBody, original.skeleton)
    ? fullBody.geometry : undefined;
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
  const materials: { piece: ClothingPiece; base: Color; color: Color; accent: boolean }[] = [];
  const ownedMaterials = new Set<Material>();
  const fittedGarments: BufferGeometry[] = [];
  const tallSocks: SkinnedMesh[] = [];
  let villageBonnet: ReturnType<typeof prepareVillageBonnet>;
  let disposeVillageShoes: ReturnType<typeof prepareVillageShoes>;
  let villageBodySwap = false;
  let checkTopEdges = Boolean(corset);
  const shapes: SkinCover[] = [];
  const topSurfaces: MeshBVH[] = [];
  const shortSkirtSurfaces: MeshBVH[] = [];
  const villageSkirtSurfaces: MeshBVH[] = [];
  const villageSkirtMeshes: SkinnedMesh[] = [];
  const tuckedSkirtSurfaces: MeshBVH[] = [];
  const fittedShapes = new Map<string, SkinCover[]>();
  // Authored bodices on the base Villager use fixed bind-space meshes.
  // Bundled outfits can change their body indices with the fit.
  let fittedMasks = corset?.authoredLacedBodice && original.name === "BODY_OUTFIT_CUT"
    && !original.geometry.getAttribute("_aven_coverage") ? new Map<string, Uint32Array>() : undefined;
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
    const fitTop = item.slot === "top" && item.piece === "shirt" && full ? prepareWardrobeTopFit(full, item.id) : undefined;
    const fitShortSkirt = item.slot === "skirt" ? prepareShortSkirtFit(item.id) : undefined;
    const garment = new Group();
    garment.name = `wardrobe-${item.id}`;
    garment.userData.clothingPiece = item.piece;
    const liningColors: Color[] = [];
    const garmentMeshes: SkinnedMesh[] = [];
    let fabricColor: Color | undefined;
    const source = item.villageNode ? scene.getObjectByName(item.villageNode) : scene;
    source?.traverse(part => {
      if (!(part instanceof SkinnedMesh)) return;
      if (removeSleeves && item.detachableSleeves && /_SLEEVE(?:_|$)/.test(part.name)) return;
      const data = { ...part.parent?.userData, ...part.userData };
      if (!Array.isArray(part.material) && part.material.userData.runtimeExclude) return;
      // The first two wrap skirts open at the center during normal movement.
      const lining = data.wardrobeRole === "shorts";
      if (lining && !item.outfit && item.id !== "skirt-01" && item.id !== "skirt-02") return;
      const mesh = bindWardrobeGarmentMesh(part, original.skeleton);
      if (!mesh) return;
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
          materials.push({ piece: item.piece, base, color: material.color, accent: !lining && channel !== "fabric" });
        }
        return material;
      };
      mesh.material = Array.isArray(part.material) ? part.material.map(cloneMaterial) : cloneMaterial(part.material);
      garmentMeshes.push(mesh);
      garment.add(mesh);
    });
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
          shapes.push({ surface, piece: item.piece });
          if (item.slot === "top" && corset?.fitTop) topSurfaces.push(surface);
          if (fitShortSkirt && !lining && corset?.fitSkirt) shortSkirtSurfaces.push(surface);
          if (item.id === "village-skirt" && corset?.authoredLacedBodice) {
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
  if (topSurfaces.length) corset?.fitTop?.(topSurfaces);
  if (shortSkirtSurfaces.length) corset?.fitSkirt?.(shortSkirtSurfaces);
  else if (corset?.authoredLacedBodice && corset.fitSkirt) {
    const stockSkirt = !replacements.has("skirt")
      ? root.getObjectByName("CLOTH_BOTTOM_SKIRT") : undefined;
    const stockSurfaces: MeshBVH[] = [];
    stockSkirt?.traverse(part => {
      if (!(part instanceof SkinnedMesh) || Array.isArray(part.material) || part.material.name !== "MAT_ClothLower") return;
      const index = part.geometry.getIndex();
      const { start, count } = part.geometry.drawRange;
      if (index && count > 0 && start < index.count) villageSkirtMeshes.push(part);
    });
    const cache = full && fittedMasks && corset.authoredLacedSource && !removedClothing.length && villageSkirtMeshes.length === 1
      && (!sources.length || (sources.length === 1 && sources[0].item.id === "village-skirt" && villageSkirtSurfaces.length > 0))
      ? villageBodiceFit(corset.authoredLacedSource, full, original.geometry, villageSkirtMeshes[0].geometry, Boolean(sources.length))
      : undefined;
    if (!villageSkirtSurfaces.length && !cache?.adjustments) {
      for (const mesh of villageSkirtMeshes) {
        const surface = bodySurface(mesh.geometry);
        if (surface) stockSurfaces.push(surface);
      }
    }
    const villageSkirt = villageSkirtSurfaces.length ? villageSkirtSurfaces : stockSurfaces;
    if (villageSkirt.length || cache?.adjustments) {
      corset.fitSkirt(villageSkirt, "village-tucked", cache);
      villageTuckedWaist = prepareLacedBodiceVillageWaist(villageSkirtMeshes);
      if (cache) fittedMasks = cache.masks;
    }
    for (const { geometry } of stockSurfaces) geometry.dispose();
  }
  if (tuckedSkirtSurfaces.length) corset?.fitTuckedHardware?.(tuckedSkirtSurfaces);
  if (!group.children.length && !replacements.size) return;
  const top = Boolean(corset) || upperGarment;
  const body = (top || skirt || restoresBody) && full && fullBody instanceof SkinnedMesh ? bindWardrobeGarmentMesh(fullBody, original.skeleton) : undefined;
  const stockBodice = stock.some(({ piece }) => (piece === "corset" || piece === "shirt") && !replacements.has(piece));
  const bra = (exposesTop || Boolean(corset)) && !upperGarment && !stockBodice && (!corset || Boolean(corset.fitTop));
  const briefs = skirtNeedsBriefs ? "under-skirt" : exposesBottom && !skirt && "standalone";
  const underwear = body && (bra || briefs) ? prepareWardrobeUnderwear(body, { bra, briefs }) : undefined;
  const braShapes: MeshBVH[] = [];
  if (underwear) {
    group.add(underwear.group);
    for (const [part, piece] of [[underwear.bra, "bra"], [underwear.briefs, "briefs"]] as const) {
      part?.traverse(mesh => {
        if (!(mesh instanceof SkinnedMesh) || Array.isArray(mesh.material) || mesh.material.userData.color_slot !== "fabric") return;
        const surface = bodySurface(mesh.geometry);
        if (!surface) return;
        if (piece === "bra") braShapes.push(surface);
        else shapes.push({ surface, piece, baseLayer: true });
      });
    }
  }
  if (body && full) {
    body.name = "fitting-room-body";
    body.material = original.material;
    body.geometry = full.clone().setIndex(new BufferAttribute(new Uint32Array(full.getIndex()!.count), 1));
    group.add(body);
  }
  if (skirt) root.userData.skirtHandRoom = MathUtils.clamp((skirtRadius ?? .23) - .23, 0, .12);
  root.add(group);
  let maskedWaist: string | undefined;
  let maskedBra: boolean | undefined;
  let socksFitted = false;
  return {
    tucksHair,
    scalpCap,
    apply(look: CharacterLook) {
      const corsetWaist = look.corset?.waist ?? look.wardrobe?.waist ?? "tucked";
      const waist = `${corset ? corsetWaist : look.wardrobe?.waist ?? "original"}:${look.overEase}`;
      const showBra = Boolean(underwear?.bra) && (look.bra ?? (restored.upper && !corset));
      if (underwear?.bra) underwear.bra.visible = showBra;
      corset?.apply(corsetWaist, look.overEase);
      villageTuckedWaist?.apply(corsetWaist === "tucked");
      villageBonnet?.setBowVisible(!removedClothing.includes("bonnet-bow"));
      for (const { part, piece } of stock) if (replacements.has(piece)) part.visible = false;
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
      if (body && full && (maskedWaist !== waist || maskedBra !== showBra)) {
        const maskKey = `${waist}:${showBra}`;
        let surfaces = fittedShapes.get(waist);
        if ((corset || restoresBody || villageBodySwap) && !surfaces && !fittedMasks?.has(maskKey)) {
          const fittedSurfaces: SkinCover[] = [];
          const addSurface = (part: Object3D, piece: ClothingPiece) => {
            if (!(part instanceof SkinnedMesh) || !isFabric(part)) return;
            const surface = bodySurface(part.geometry);
            if (surface) fittedSurfaces.push({ surface, piece, rebuiltUnderbust: part.userData.rebuiltUnderbust === true });
          };
          corset?.group.traverseVisible(part => addSurface(part, "corset"));
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
        fitBodyMask(body, original, full, top, skirt, restored, visibleShapes,
          showBra ? braShapes : [], checkTopEdges, corset?.group.userData.lacedBodiceStraps ? corsetWaist : undefined,
          corset?.authoredLacedBodice ?? false, fittedMasks && { masks: fittedMasks, key: maskKey });
        maskedWaist = waist;
        maskedBra = showBra;
      }
      if (body) original.visible = false;
      underwear?.applyColors(piece => underwearColors(look, piece));
      for (const { piece, color, base, accent } of materials) {
        const dye = clothingColors(look, piece);
        color.copy(base);
        const tint = accent ? dye?.accent ?? look.appearance.accent : dye?.color ?? (look.appearance.color !== "original" ? look.fabric : undefined);
        if (tint) color.set(tint);
      }
    },
    dispose() {
      group.removeFromParent();
      underwear?.dispose();
      body?.geometry.dispose();
      villageBonnet?.dispose();
      disposeVillageShoes?.();
      villageTuckedWaist?.dispose();
      for (const geometry of fittedGarments) geometry.dispose();
      for (const { surface } of shapes) surface.geometry.dispose();
      for (const { geometry } of braShapes) geometry.dispose();
      for (const surfaces of fittedShapes.values()) for (const { surface } of surfaces) surface.geometry.dispose();
      for (const material of ownedMaterials) material.dispose();
    },
  };
}
