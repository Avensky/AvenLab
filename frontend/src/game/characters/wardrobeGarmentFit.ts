import { BufferAttribute, type BufferGeometry, Color, Group, MathUtils, SkinnedMesh, Vector3, type Material, type Object3D, type Skeleton } from "three";
import type { MeshBVH } from "three-mesh-bvh";
import type { CharacterLook } from "./characterCatalog";
import { clothingColors, clothingPieceFor, type ClothingPiece } from "./clothingPieces";
import { prepareGothicSkirtFit } from "./gothicSkirtFit";
import { prepareSockSkirtFit } from "./sockSkirtFit";
import { prepareShoelessSockFit } from "./wardrobeSocksFit";
import type { StandaloneCorset } from "./standaloneCorset";
import { wardrobeGarmentReplacements, wardrobeRemovalPieces, type getWardrobeGarment, type WardrobeGarmentSlot, type WardrobeRemoval } from "./wardrobeGarments";
import { prepareWardrobeTopFit } from "./wardrobeTopFit";
import { prepareWardrobeCoverage, wardrobeCoverageSurface as bodySurface } from "./wardrobeCoverage";

export type WardrobeGarmentSource = { item: NonNullable<ReturnType<typeof getWardrobeGarment>>; scene: Object3D; authoredFit?: boolean };

export function replacesVillagerBody(slot: WardrobeGarmentSlot) {
  return slot === "top" || slot === "skirt" || slot === "dress";
}

export function removalNeedsVillagerBody(slot: WardrobeRemoval) {
  return slot === "top" || slot === "corset" || slot === "skirt" || slot === "shoes";
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
    && !/hardware|ornament|buttons|buckle/.test(tintChannel(mesh.material, mesh));
}

const coversSkin = new Set<ClothingPiece>(["corset", "shirt", "sleeves", "skirt", "underskirt", "shorts", "shoes", "socks", "dress"]);

type RestoredSkin = { upper: boolean; skirt: boolean; feet: boolean };

function fitBodyMask(
  body: SkinnedMesh, original: SkinnedMesh, full: BufferGeometry, top: boolean, skirt: boolean,
  restored: RestoredSkin, clothes: MeshBVH[], checkTopEdges: boolean,
) {
  const position = full.getAttribute("position"), index = full.getIndex()!;
  const baseline = bodySurface(original.geometry);
  const fittedIndex = body.geometry.getIndex()!;
  const a = new Vector3(), b = new Vector3(), c = new Vector3(), point = new Vector3();
  const hit = { point: new Vector3(), distance: 0, faceIndex: 0 };
  const covered = prepareWardrobeCoverage(clothes);
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
    const restoredSkin = (restored.upper && point.y > .92)
      || (restored.skirt && point.y > .075 && point.y < 1.24)
      || (restored.feet && point.y < .115);
    const replaced = restoredSkin || (upperBody ? top : skirt && point.y > .075);
    if (!replaced && !baseline?.closestPointToPoint(point, hit, 0, .0016)) continue;
    // A strap or neckline can cross the middle of a skin triangle. Keep the
    // skin at that edge unless the fabric covers the face and its corners.
    if (replaced && covered(point, a, b, c, restoredSkin || (upperBody && checkTopEdges))) continue;
    fittedIndex.array[visible++] = ai;
    fittedIndex.array[visible++] = bi;
    fittedIndex.array[visible++] = ci;
  }
  fittedIndex.needsUpdate = true;
  body.geometry.setDrawRange(0, visible);
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
    && wardrobeRemovalPieces[slot].some(piece => stock.some(part => part.piece === piece)));
  const restored = { upper: removals.includes("top") || removals.includes("corset"), skirt: removals.includes("skirt"), feet: removals.includes("shoes") };
  const restoresBody = restored.upper || restored.skirt || restored.feet;
  const replacements = new Set<ClothingPiece>(removals.flatMap(slot => wardrobeRemovalPieces[slot]));
  const group = new Group();
  group.name = "fitting-room-garments";
  const materials: { piece: ClothingPiece; base: Color; color: Color; accent: boolean }[] = [];
  const ownedMaterials = new Set<Material>();
  const fittedGarments: BufferGeometry[] = [];
  const tallSocks: SkinnedMesh[] = [];
  let checkTopEdges = Boolean(corset);
  const shapes: MeshBVH[] = [];
  const fittedShapes = new Map<string, MeshBVH[]>();
  if (corset) {
    group.add(corset.group);
    for (const piece of wardrobeGarmentReplacements.top) replacements.add(piece);
  }
  let top = Boolean(corset), skirt = false;
  let tucksHair = false;
  let scalpCap = false;
  let skirtRadius: number | undefined;
  for (const { item, scene, authoredFit } of sources) {
    if (replacesVillagerBody(item.slot) && !full?.getIndex()) continue;
    const fitTop = item.slot === "top" && full ? prepareWardrobeTopFit(full, item.id) : undefined;
    const garment = new Group();
    garment.name = `wardrobe-${item.id}`;
    garment.userData.clothingPiece = item.piece;
    const liningColors: Color[] = [];
    const garmentMeshes: SkinnedMesh[] = [];
    let fabricColor: Color | undefined;
    scene.traverse(part => {
      if (!(part instanceof SkinnedMesh)) return;
      const data = { ...part.parent?.userData, ...part.userData };
      if (!Array.isArray(part.material) && part.material.userData.runtimeExclude) return;
      // The first two wrap skirts open at the center during normal movement.
      const lining = data.wardrobeRole === "shorts";
      if (lining && item.id !== "skirt-01" && item.id !== "skirt-02") return;
      const mesh = bindWardrobeGarmentMesh(part, original.skeleton);
      if (!mesh) return;
      mesh.userData.clothingPiece = item.piece;
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
    if (item.slot === "hat") {
      tucksHair ||= Boolean(item.tucksHair);
      scalpCap ||= Boolean(item.scalpCap);
    }
    if (item.id === "socks-04") tallSocks.push(...garmentMeshes);
    const skirtBody = full && !authoredFit && item.slot === "skirt" && item.id.startsWith("gothic-skirt-") ? bodySurface(full) : undefined;
    const skirtSurfaces = skirtBody ? garmentMeshes.filter(isFabric).flatMap(mesh => bodySurface(mesh.geometry) ?? []) : [];
    const fitSkirt = skirtBody && skirtSurfaces.length ? prepareGothicSkirtFit(skirtBody, skirtSurfaces, item.id) : undefined;
    const sockBody = item.slot === "socks" && restored.feet && full ? bodySurface(full) : undefined;
    const fitSocks = sockBody && prepareShoelessSockFit(sockBody);
    for (const { geometry } of skirtSurfaces) geometry.dispose();
    for (const mesh of garmentMeshes) {
      const fitted = (fitTop ?? fitSkirt ?? fitSocks)?.(mesh.geometry);
      if (fitted) {
        mesh.geometry = fitted;
        fittedGarments.push(fitted);
      }
      if ((replacesVillagerBody(item.slot) || (restoresBody && coversSkin.has(item.piece))) && isFabric(mesh)) {
        const surface = bodySurface(mesh.geometry);
        if (surface) shapes.push(surface);
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
    checkTopEdges ||= item.slot === "top";
    if (fabricColor) for (const color of liningColors) color.copy(fabricColor);
    group.add(garment);
    for (const piece of wardrobeGarmentReplacements[item.slot]) replacements.add(piece);
    top ||= item.slot === "top" || item.slot === "dress";
    skirt ||= item.slot === "skirt" || item.slot === "dress";
  }
  if (!group.children.length && !replacements.size) return;
  const body = (top || skirt || restoresBody) && full && fullBody instanceof SkinnedMesh ? bindWardrobeGarmentMesh(fullBody, original.skeleton) : undefined;
  if (body && full) {
    body.name = "fitting-room-body";
    body.material = original.material;
    body.geometry = full.clone().setIndex(new BufferAttribute(new Uint32Array(full.getIndex()!.count), 1));
    group.add(body);
  }
  if (skirt) root.userData.skirtHandRoom = MathUtils.clamp((skirtRadius ?? .23) - .23, 0, .12);
  root.add(group);
  let maskedWaist: string | undefined;
  let socksFitted = false;
  return {
    tucksHair,
    scalpCap,
    apply(look: CharacterLook) {
      const corsetWaist = look.corset?.waist ?? "tucked";
      const waist = `${corset ? corsetWaist : look.wardrobe?.waist ?? "original"}:${look.overEase}`;
      corset?.apply(corsetWaist, look.overEase);
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
      if (body && full && maskedWaist !== waist) {
        let surfaces = fittedShapes.get(waist);
        if ((corset || restoresBody) && !surfaces) {
          const fittedSurfaces: MeshBVH[] = [];
          const addSurface = (part: Object3D) => {
            if (!(part instanceof SkinnedMesh) || !isFabric(part)) return;
            const surface = bodySurface(part.geometry);
            if (surface) fittedSurfaces.push(surface);
          };
          corset?.group.traverseVisible(addSurface);
          if (restoresBody) {
            for (const { part, piece } of stock) {
              if (!coversSkin.has(piece)) continue;
              let ancestor: Object3D | null = part;
              while (ancestor?.visible) ancestor = ancestor.parent;
              if (!ancestor) addSurface(part);
            }
          }
          fittedShapes.set(waist, fittedSurfaces);
          surfaces = fittedSurfaces;
        }
        fitBodyMask(body, original, full, top, skirt, restored, surfaces ? [...shapes, ...surfaces] : shapes, checkTopEdges);
        maskedWaist = waist;
      }
      if (body) original.visible = false;
      for (const { piece, color, base, accent } of materials) {
        const dye = clothingColors(look, piece);
        color.copy(base);
        const tint = accent ? dye?.accent ?? look.appearance.accent : dye?.color ?? (look.appearance.color !== "original" ? look.fabric : undefined);
        if (tint) color.set(tint);
      }
    },
    dispose() {
      group.removeFromParent();
      body?.geometry.dispose();
      for (const geometry of fittedGarments) geometry.dispose();
      for (const { geometry } of shapes) geometry.dispose();
      for (const surfaces of fittedShapes.values()) for (const { geometry } of surfaces) geometry.dispose();
      for (const material of ownedMaterials) material.dispose();
    },
  };
}
