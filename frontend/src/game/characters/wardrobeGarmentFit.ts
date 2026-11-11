import { BufferAttribute, BufferGeometry, Color, DoubleSide, Group, MathUtils, Ray, SkinnedMesh, Vector3, type Material, type Object3D, type Skeleton } from "three";
import { MeshBVH } from "three-mesh-bvh";
import type { CharacterLook } from "./characterCatalog";
import { clothingColors, clothingPieceFor, type ClothingPiece } from "./clothingPieces";
import type { StandaloneCorset } from "./standaloneCorset";
import { wardrobeGarmentReplacements, type getWardrobeGarment, type WardrobeGarmentSlot } from "./wardrobeGarments";
import { prepareWardrobeTopFit } from "./wardrobeTopFit";

export type WardrobeGarmentSource = { item: NonNullable<ReturnType<typeof getWardrobeGarment>>; scene: Object3D };

export function replacesVillagerBody(slot: WardrobeGarmentSlot) {
  return slot === "top" || slot === "skirt" || slot === "dress";
}

/** Imported Vesper garments are authored in the same bind space as the actor. */
export function bindWardrobeGarmentMesh(source: SkinnedMesh, skeleton: Skeleton) {
  const joints = source.skeleton.bones;
  if (joints.length !== skeleton.bones.length || joints.some((bone, i) => bone.name !== skeleton.bones[i].name)) return;
  const mesh = source.clone(false);
  mesh.bind(skeleton, source.bindMatrix);
  mesh.frustumCulled = false;
  return mesh;
}

function tintChannel(material: Material, mesh: SkinnedMesh) {
  const data = material.userData;
  return String(data.tintChannel ?? data.color_slot ?? mesh.userData.wardrobePart ?? "fabric");
}

function bodySurface(geometry: BufferGeometry) {
  const index = geometry.getIndex();
  if (!index) return;
  const { start, count } = geometry.drawRange;
  const indices = index.array.slice(start, Math.min(start + count, index.count));
  if (!indices.length) return;
  const surface = new BufferGeometry().setAttribute("position", geometry.getAttribute("position"))
    .setIndex(new BufferAttribute(indices, 1));
  return new MeshBVH(surface);
}

function fitBodyMask(body: SkinnedMesh, original: SkinnedMesh, full: BufferGeometry, top: boolean, skirt: boolean, clothes: MeshBVH[], checkTopEdges: boolean) {
  const position = full.getAttribute("position"), index = full.getIndex()!;
  const baseline = bodySurface(original.geometry);
  const fittedIndex = body.geometry.getIndex()!;
  const a = new Vector3(), b = new Vector3(), c = new Vector3(), point = new Vector3(), normal = new Vector3();
  const ray = new Ray(), edge = new Vector3();
  const hit = { point: new Vector3(), distance: 0, faceIndex: 0 };
  const underCloth = (corner?: Vector3) => {
    ray.origin.copy(point);
    if (corner) ray.origin.lerp(corner, .8);
    ray.origin.addScaledVector(normal, -.012);
    return clothes.some(surface => surface.raycastFirst(ray, DoubleSide, 0, .052));
  };
  let visible = 0;
  for (let i = 0; i < index.count; i += 3) {
    const ai = index.getX(i), bi = index.getX(i + 1), ci = index.getX(i + 2);
    a.fromBufferAttribute(position, ai);
    b.fromBufferAttribute(position, bi);
    c.fromBufferAttribute(position, ci);
    point.copy(a).add(b).add(c).multiplyScalar(1 / 3);
    const upperBody = point.y > 1.10 || (point.y > .87 && Math.abs(point.x) > .17);
    const replaced = upperBody ? top : skirt && point.y > .075;
    if (!replaced && !baseline?.closestPointToPoint(point, hit, 0, .0016)) continue;
    if (replaced) {
      normal.copy(b).sub(a).cross(edge.copy(c).sub(a)).normalize();
      ray.direction.copy(normal);
      // A shirt edge can cross the middle of a skin triangle. Keep those
      // triangles so the neckline and armholes never cut a hole in the skin.
      if (underCloth() && (!(upperBody && checkTopEdges)
        || (underCloth(a) && underCloth(b) && underCloth(c)))) continue;
    }
    fittedIndex.array[visible++] = ai;
    fittedIndex.array[visible++] = bi;
    fittedIndex.array[visible++] = ci;
  }
  fittedIndex.needsUpdate = true;
  body.geometry.setDrawRange(0, visible);
  baseline?.geometry.dispose();
}

export function prepareWardrobeGarments(root: Object3D, sources: readonly WardrobeGarmentSource[], fullBody?: Object3D, corset?: StandaloneCorset) {
  const original = root.getObjectByName("BODY_WARDROBE") ?? root.getObjectByName("BODY_OUTFIT_CUT");
  if ((!sources.length && !corset) || !(original instanceof SkinnedMesh)) return;
  const full = fullBody instanceof SkinnedMesh ? fullBody.geometry : undefined;
  const replacements = new Set<ClothingPiece>();
  const stock: { part: Object3D; piece: ClothingPiece }[] = [];
  root.traverse(part => {
    const piece = clothingPieceFor(part);
    if (piece) stock.push({ part, piece });
  });
  const group = new Group();
  group.name = "fitting-room-garments";
  const materials: { piece: ClothingPiece; base: Color; color: Color; accent: boolean }[] = [];
  const ownedMaterials = new Set<Material>();
  const fittedTops: BufferGeometry[] = [];
  let checkTopEdges = false;
  const shapes: MeshBVH[] = [];
  const corsetShapes = { tucked: [] as MeshBVH[], over: [] as MeshBVH[] };
  if (corset) {
    group.add(corset.group);
    for (const piece of wardrobeGarmentReplacements.top) replacements.add(piece);
    for (const waist of ["tucked", "over"] as const) {
      corset.apply(waist);
      corset.group.traverseVisible(part => {
        if (!(part instanceof SkinnedMesh) || Array.isArray(part.material)
          || part.material.transparent || part.material.userData.color_slot === "hardware") return;
        const surface = bodySurface(part.geometry);
        if (surface) corsetShapes[waist].push(surface);
      });
    }
  }
  let top = Boolean(corset), skirt = false;
  let skirtRadius: number | undefined;
  for (const { item, scene } of sources) {
    if (replacesVillagerBody(item.slot) && !full?.getIndex()) continue;
    const fitTop = item.slot === "top" && full ? prepareWardrobeTopFit(full, item.id) : undefined;
    const garment = new Group();
    garment.name = `wardrobe-${item.id}`;
    garment.userData.clothingPiece = item.piece;
    const liningColors: Color[] = [];
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
      const fittedTop = fitTop?.(mesh.geometry);
      if (fittedTop) {
        mesh.geometry = fittedTop;
        fittedTops.push(fittedTop);
      }
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
      if (item.slot === "socks") {
        const fit = mesh.morphTargetDictionary?.["mary-jane-v1-fit"];
        if (fit !== undefined && mesh.morphTargetInfluences) mesh.morphTargetInfluences[fit] = 1;
      }
      if (replacesVillagerBody(item.slot) && !Array.isArray(part.material) && !part.material.transparent
        && !/hardware|ornament|buttons|buckle/.test(tintChannel(part.material, mesh))) {
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
      garment.add(mesh);
    });
    if (!garment.children.length) continue;
    checkTopEdges ||= item.slot === "top";
    if (fabricColor) for (const color of liningColors) color.copy(fabricColor);
    group.add(garment);
    for (const piece of wardrobeGarmentReplacements[item.slot]) replacements.add(piece);
    top ||= item.slot === "top" || item.slot === "dress";
    skirt ||= item.slot === "skirt" || item.slot === "dress";
  }
  if (!group.children.length) return;
  const body = (top || skirt) && full && fullBody instanceof SkinnedMesh ? bindWardrobeGarmentMesh(fullBody, original.skeleton) : undefined;
  if (body && full) {
    body.name = "fitting-room-body";
    body.material = original.material;
    body.geometry = full.clone().setIndex(new BufferAttribute(new Uint32Array(full.getIndex()!.count), 1));
    group.add(body);
  }
  if (skirt) root.userData.skirtHandRoom = MathUtils.clamp((skirtRadius ?? .23) - .23, 0, .12);
  root.add(group);
  let maskedWaist: string | undefined;
  return {
    apply(look: CharacterLook) {
      const corsetWaist = look.corset?.waist ?? "tucked";
      const waist = corset ? corsetWaist : look.wardrobe?.waist ?? "original";
      corset?.apply(corsetWaist);
      if (body && full && maskedWaist !== waist) {
        fitBodyMask(body, original, full, top, skirt, corset ? [...shapes, ...corsetShapes[corsetWaist]] : shapes, checkTopEdges);
        maskedWaist = waist;
      }
      if (body) original.visible = false;
      for (const { part, piece } of stock) if (replacements.has(piece)) part.visible = false;
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
      for (const geometry of fittedTops) geometry.dispose();
      for (const { geometry } of shapes) geometry.dispose();
      for (const { geometry } of [...corsetShapes.tucked, ...corsetShapes.over]) geometry.dispose();
      for (const material of ownedMaterials) material.dispose();
    },
  };
}
