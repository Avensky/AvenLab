import { DoubleSide, MathUtils, MeshStandardMaterial, SkinnedMesh, type BufferGeometry, type Object3D, type Vector3 } from "three";
import { prepareSkirtCorsetFit } from "./gothicCorsetTuck";
import { prepareGothicWaistline } from "./gothicSkirtFit";
import { seatHandkerchiefSkirtPanels } from "./gothicSkirtPanels";
import { wardrobeCoverageSurface } from "./wardrobeCoverage";
import { hasAuthoredSweetheartFit } from "./sweetheartCorset";
import { fitWardrobeSurface } from "./wardrobeSurface";

function addWaistSeams(body: SkinnedMesh, skirt: Object3D, fabric: MeshStandardMaterial, style: string,
  fits: readonly (readonly ["tucked" | "over", BufferGeometry])[]) {
  const material = new MeshStandardMaterial({
    name: `MAT_GOTHIC_${style}_WaistSeam`, color: fabric.color, roughness: fabric.roughness,
    metalness: fabric.metalness, side: DoubleSide,
  });
  material.userData.color_slot = "fabric";
  const seams = fits.map(([fit, geometry]) => {
    const seam = body.clone(false);
    seam.name = `CLOTH_GOTHIC_${style}_WAIST_SEAM_${fit.toUpperCase()}`;
    seam.userData = { clothingPiece: "skirt", wardrobeRole: `bottom-seam-${fit}` };
    seam.geometry = geometry;
    seam.material = material;
    skirt.add(seam);
    return seam;
  });
  return () => {
    for (const seam of seams) { seam.removeFromParent(); seam.geometry.dispose(); }
    material.dispose();
  };
}

function finishSweetheartWaist(root: Object3D, skirt: Object3D, fabric: MeshStandardMaterial) {
  const body = root.getObjectByName("BODY_WARDROBE");
  if (!(body instanceof SkinnedMesh)) return;
  const boundaries = [
    (point: Vector3) => point.y - 1.049,
    (point: Vector3) => 1.105 - point.y,
    (point: Vector3) => .141 - Math.abs(point.x),
  ];
  const over = fitWardrobeSurface(body.geometry, boundaries, .003);
  const tucked = fitWardrobeSurface(body.geometry, boundaries, point => .003 + .009 * MathUtils.smoothstep(point.y, 1.06, 1.092));
  if (!over || !tucked) { over?.dispose(); tucked?.dispose(); return; }
  return addWaistSeams(body, skirt, fabric, "02", [["tucked", tucked], ["over", over]]);
}

function finishRuffledTrim(skirt: Object3D, trim: SkinnedMesh) {
  const source = trim.geometry, index = source.getIndex(), positions = source.getAttribute("position");
  if (!index || !positions) return;

  // The source trim includes a tall inner waist panel. The outer skirt and
  // tucked corset already overlap here, so keep just the lower ruffled hem.
  const kept: number[] = [];
  for (let i = 0; i < index.count; i += 3) {
    const a = index.getX(i), b = index.getX(i + 1), c = index.getX(i + 2);
    if (Math.max(positions.getY(a), positions.getY(b), positions.getY(c)) <= 1.06) kept.push(a, b, c);
  }
  if (!kept.length || kept.length === index.count) return;

  const geometry = source.clone();
  geometry.setIndex(kept);
  geometry.setDrawRange(0, kept.length);
  const tucked = trim.clone(false);
  tucked.name = "CLOTH_GOTHIC_03_TRIM_TUCKED";
  tucked.geometry = geometry;
  tucked.userData = { ...tucked.userData, clothingPiece: "skirt", wardrobeRole: "bottom-trim-tucked" };
  const authoredData = trim.userData;
  trim.userData = { ...authoredData, clothingPiece: "skirt", wardrobeRole: "bottom-trim-over" };
  skirt.add(tucked);
  return () => {
    tucked.removeFromParent();
    trim.userData = authoredData;
    geometry.dispose();
  };
}

function fitRuffledWaist(root: Object3D, skirt: Object3D, fabric: MeshStandardMaterial) {
  const body = root.getObjectByName("BODY_WARDROBE");
  const corset = root.getObjectByName("CLOTH_CORSET_TUCKED");
  if (!(body instanceof SkinnedMesh) || !corset || corset.userData.ruffledSourceFit === true) return;
  const geometry = fitWardrobeSurface(body.geometry, [
    point => point.y - 1.052,
    point => 1.112 - point.y,
    point => .153 - Math.abs(point.x),
  ], point => .003 + .009 * MathUtils.smoothstep(point.y, 1.065, 1.098));
  if (!geometry) return;
  const disposeSeam = addWaistSeams(body, skirt, fabric, "03", [["tucked", geometry]]);

  // Keep the lower bodice outside the skin as it enters the new waist seam.
  const panels: { mesh: SkinnedMesh; source: BufferGeometry; fitted: BufferGeometry }[] = [];
  corset.traverse(mesh => {
    if (!(mesh instanceof SkinnedMesh)) return;
    const source = mesh.geometry;
    const fitted = source.clone();
    const position = fitted.getAttribute("position");
    for (let i = 0; i < position.count; i++) {
      const x = position.getX(i), y = position.getY(i), z = position.getZ(i) - .025;
      const radius = Math.hypot(x, z);
      if (!radius || y >= 1.217) continue;
      const distance = .007 * (1 - MathUtils.smoothstep(y, 1.181, 1.217));
      const scale = 1 + distance / radius;
      position.setXYZ(i, x * scale, y, .025 + z * scale);
    }
    fitted.computeBoundingBox();
    fitted.computeBoundingSphere();
    mesh.geometry = fitted;
    panels.push({ mesh, source, fitted });
  });
  return () => {
    disposeSeam();
    for (const { mesh, source, fitted } of panels) {
      mesh.geometry = source;
      fitted.dispose();
    }
  };
}

/** Keep the High Collar's laced waistband without its redundant short inner skirt. */
export function highCollarSkirtWaistband(source: BufferGeometry, authored: BufferGeometry = source) {
  const index = source.getIndex();
  // A fitted waistband can dip below this authored separation height.
  // Use the original positions to retain all of its faces after fitting.
  const positions = authored.getAttribute("position");
  if (!index || !positions) return;

  // This material contains the laced waistband and a separate short skirt.
  // The long pleated skirt already supplies the full hem, so keep the waistband.
  const waistband: number[] = [];
  for (let i = 0; i < index.count; i += 3) {
    const a = index.getX(i), b = index.getX(i + 1), c = index.getX(i + 2);
    if (Math.min(positions.getY(a), positions.getY(b), positions.getY(c)) > 1) waistband.push(a, b, c);
  }
  if (!waistband.length || waistband.length === index.count) return;

  const geometry = source.clone();
  geometry.setIndex(waistband);
  geometry.setDrawRange(0, waistband.length);
  return geometry;
}

function finishHighCollarSkirt(fabric: SkinnedMesh) {
  const source = fabric.geometry;
  const geometry = highCollarSkirtWaistband(source);
  if (!geometry) return;
  fabric.geometry = geometry;
  return () => {
    fabric.geometry = source;
    geometry.dispose();
  };
}

/** Fit the skirt layers around the active corset without adding separate underwear. */
export function prepareWardrobeSkirt(root: Object3D) {
  const skirt = root.getObjectByName("CLOTH_BOTTOM_SKIRT");
  if (!skirt) return;
  let panel: SkinnedMesh | undefined;
  let ruffledTrim: SkinnedMesh | undefined;
  let sweetheartFabric: MeshStandardMaterial | undefined;
  let highCollarFabric: SkinnedMesh | undefined;
  const retiredSweetheartPanels: SkinnedMesh[] = [];
  skirt.traverse(part => {
    if (!(part instanceof SkinnedMesh) || Array.isArray(part.material)) return;
    const name = part.material.name;
    if (name === "MAT_GOTHIC_02_Trim_1" || name === "MAT_GOTHIC_02_Hardware_4") retiredSweetheartPanels.push(part);
    if (name === "MAT_GOTHIC_02_Fabric_0" && part.material instanceof MeshStandardMaterial) sweetheartFabric = part.material;
    if (name === "MAT_GOTHIC_03_Fabric_2") panel = part;
    if (name === "MAT_GOTHIC_03_Trim_1") ruffledTrim = part;
    if (name === "MAT_GOTHIC_05_Fabric_0") highCollarFabric = part;
  });
  for (const part of retiredSweetheartPanels) part.removeFromParent();
  if (sweetheartFabric) {
    // The revised bundle has an authored skirt rim fitted over the tucked corset.
    if (hasAuthoredSweetheartFit(root, 2)) return;
    return finishSweetheartWaist(root, skirt, sweetheartFabric);
  }
  if (highCollarFabric) return finishHighCollarSkirt(highCollarFabric);
  // Give the Gothic 03 overskirt room around its ruffles, fading out at the waist.
  const outer = panel;
  if (!outer) return;
  const disposeTrim = ruffledTrim && finishRuffledTrim(skirt, ruffledTrim);
  const disposeWaist = outer.material instanceof MeshStandardMaterial && fitRuffledWaist(root, skirt, outer.material);

  const source = outer.geometry;
  const geometry = source.clone();
  const positions = geometry.getAttribute("position");
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i), y = positions.getY(i), z = positions.getZ(i) - .025;
    const radius = Math.hypot(x, z);
    if (radius === 0) continue;
    const direction = z / radius;
    const front = MathUtils.smoothstep(direction, .53, .80);
    const panel = MathUtils.smoothstep(y, .69, .75) * (1 - MathUtils.smoothstep(y, .85, .94));
    const sides = 1 - MathUtils.smoothstep(Math.abs(direction), .15, .52);
    const hem = 1 - MathUtils.smoothstep(y, .65, .71);
    const room = .009 * (1 - MathUtils.smoothstep(y, .94, 1.05)) + .039 * front * panel + .025 * sides * hem;
    const scale = 1 + room / radius;
    positions.setXYZ(i, x * scale, y, .025 + z * scale);
  }
  geometry.computeVertexNormals();
  outer.geometry = geometry;
  return () => {
    outer.geometry = source;
    geometry.dispose();
    disposeTrim?.();
    if (disposeWaist) disposeWaist();
  };
}

/** Matched outfits have their own skirt meshes and, on the Ruffled set, a taller Over-only trim. */
export function fitBundledGothicWaist(root: Object3D, body: BufferGeometry, corset?: Object3D) {
  const skirt = root.getObjectByName("CLOTH_BOTTOM_SKIRT");
  if (skirt?.userData.wardrobeRole !== "bottom") return;
  const meshes = skirt.getObjectsByProperty("isSkinnedMesh", true) as SkinnedMesh[];
  const materials = meshes.flatMap(mesh => Array.isArray(mesh.material) ? mesh.material : [mesh.material]);
  const style = materials.map(material => /^MAT_GOTHIC_(0[1-5])_/.exec(material.name)?.[1]).find(Boolean);
  if (!style) return;
  const bodySurface = wardrobeCoverageSurface(body, [.84, 1.25]);
  if (!bodySurface) return;
  const panels = meshes.flatMap(mesh => {
    const surface = wardrobeCoverageSurface(mesh.geometry);
    const role: string = mesh.userData.wardrobeRole ?? "";
    return surface ? [{ mesh, surface, overOnly: role.endsWith("-over"), tuckedOnly: role.endsWith("-tucked") }] : [];
  });
  const tucked = panels.filter(panel => !panel.overOnly);
  const id = `gothic-skirt-${style}`;
  const fitWaist = prepareGothicWaistline(bodySurface, tucked.map(panel => panel.surface), id);
  const fitOver = panels.some(panel => panel.overOnly) ? prepareGothicWaistline(bodySurface,
    panels.filter(panel => !panel.tuckedOnly).map(panel => panel.surface), id) : fitWaist;
  const changed = panels.flatMap(({ mesh, surface, overOnly }) => {
    const source = mesh.geometry;
    const fitted = (overOnly ? fitOver : fitWaist)(source);
    surface.geometry.dispose();
    if (!fitted) return [];
    mesh.geometry = fitted;
    return [{ mesh, source, fitted }];
  });
  bodySurface.geometry.dispose();
  // Seat the covered handkerchief layer only after the shared waist fit, so
  // its corrected inner surface cannot change the accepted outer waistband.
  let handkerchief: { mesh: SkinnedMesh; source: BufferGeometry; fitted: BufferGeometry } | undefined;
  if (style === "01") {
    const mesh = meshes.find(part => !Array.isArray(part.material) && part.material.name === "MAT_GOTHIC_01_Fabric_1");
    const support = mesh && wardrobeCoverageSurface(body, [.60, 1.04]);
    if (mesh && support) {
      const source = mesh.geometry;
      try {
        const fitted = seatHandkerchiefSkirtPanels(meshes, support);
        if (fitted) handkerchief = { mesh, source, fitted };
      } finally { support.geometry.dispose(); }
    }
  }
  const tuckedPanels = tucked.map(panel => panel.mesh);
  const tuck = corset && prepareSkirtCorsetFit(corset, tuckedPanels, body, true);
  return {
    dispose() {
      tuck?.dispose();
      if (handkerchief) {
        handkerchief.mesh.geometry = handkerchief.source;
        handkerchief.fitted.dispose();
      }
      for (const { mesh, source, fitted } of changed) {
        mesh.geometry = source;
        fitted.dispose();
      }
    },
  };
}
