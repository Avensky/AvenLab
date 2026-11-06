import type { Piece } from "../document/layoutDocument.ts";
import { kitAsset } from "../mapKit/catalog.ts";
import { modelAsset } from "../models/modelCatalog.ts";
import { streetProp } from "../props/streetPropCatalog.ts";
import { roadAsset } from "../roads/roadCatalog.ts";
import { vehicleAsset } from "../vehicles/vehicleCatalog.ts";
import type { WebGLRenderer } from "three";

export type PortraitSource = { url: string; node?: string };

/** Resolve the *actual* prefab geometry, never a lookalike image from another kit. */
export function portraitSource(piece: Piece): PortraitSource | null {
  const kit = kitAsset(piece.id);
  if (kit) return { url: `/models/roads/${kit.lodFiles[0]}`, node: kit.node };
  if (piece.road) {
    const road = roadAsset(piece.road.asset);
    return road ? { url: road.lods[0].url } : null;
  }
  if (piece.model) {
    const model = modelAsset(piece.model.asset);
    return model ? { url: model.lods[0].url } : null;
  }
  if (piece.vehicle) {
    const vehicle = vehicleAsset(piece.vehicle.asset);
    return vehicle ? { url: vehicle.url } : null;
  }
  const prop = streetProp(piece.id);
  return prop
    ? { url: "/models/roads/Downtown_Roadworks.glb", node: prop.node }
    : null;
}

// A single offscreen renderer serves the whole library. Do not mount a WebGL
// Canvas in every tile: browsers limit contexts and the editor already has one.
const portraits = new Map<string, Promise<string>>();
let queue: Promise<unknown> = Promise.resolve();
let renderer: WebGLRenderer | null = null;

export function prefabPortrait(piece: Piece): Promise<string> | null {
  const source = portraitSource(piece);
  if (!source) return null;
  const key = `${source.url}#${source.node ?? "scene"}`;
  let result = portraits.get(key);
  if (!result) {
    result = queue.then(() => renderPortrait(source));
    // A missing/invalid asset should allow retry next time the library opens.
    result.catch(() => portraits.delete(key));
    portraits.set(key, result);
    queue = result.catch(() => undefined);
  }
  return result;
}

async function renderPortrait(source: PortraitSource): Promise<string> {
  const [three, { GLTFLoader }, { DRACOLoader }] = await Promise.all([
    import("three"),
    import("three/addons/loaders/GLTFLoader.js"),
    import("three/addons/loaders/DRACOLoader.js"),
  ]);
  // One renderer for the whole sidebar. The queued renders never compete for
  // WebGL contexts with the editor's main scene.
  renderer ??= new three.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true });
  const target = renderer;
  const decoder = new DRACOLoader();
  decoder.setDecoderPath("/draco/");
  const loader = new GLTFLoader();
  loader.setDRACOLoader(decoder);
  try {
    target.setSize(240, 144);
    target.setPixelRatio(1);
    target.outputColorSpace = three.SRGBColorSpace;
    target.toneMapping = three.ACESFilmicToneMapping;
    target.toneMappingExposure = 1.15;
    const gltf = await loader.loadAsync(source.url);
    const original = source.node
      ? gltf.scene.getObjectByName(source.node)
      : gltf.scene;
    if (!original) throw Error(`Missing portrait node ${source.node}`);
    const scene = new three.Scene();
    scene.background = new three.Color("#172534");
    scene.add(new three.HemisphereLight("#eff6ff", "#354255", 2.1));
    const light = new three.DirectionalLight("#ffffff", 2.8);
    light.position.set(7, 14, 10);
    scene.add(light);
    const object = original.clone(true);
    // Catalog nodes are positioned at their module inlet; center the rendered
    // bounds, including all meshes rather than relying on that inlet pivot.
    scene.add(object);
    const bounds = new three.Box3().setFromObject(object);
    if (bounds.isEmpty()) throw Error(`Empty portrait asset ${source.url}`);
    const center = bounds.getCenter(new three.Vector3());
    const size = bounds.getSize(new three.Vector3());
    const camera = new three.PerspectiveCamera(35, 240 / 144, 0.01, 1e6);
    const direction = new three.Vector3(0.95, 1.25, 1.5).normalize();
    // Fit the projected extent to both axes (a long bridge must not be cropped).
    const distance = Math.max(size.length() * 1.65, 1);
    camera.position.copy(center).addScaledVector(direction, distance);
    camera.lookAt(center);
    camera.updateMatrixWorld();
    const boxCorners = [
      [bounds.min.x, bounds.min.y, bounds.min.z],
      [bounds.min.x, bounds.min.y, bounds.max.z],
      [bounds.min.x, bounds.max.y, bounds.min.z],
      [bounds.min.x, bounds.max.y, bounds.max.z],
      [bounds.max.x, bounds.min.y, bounds.min.z],
      [bounds.max.x, bounds.min.y, bounds.max.z],
      [bounds.max.x, bounds.max.y, bounds.min.z],
      [bounds.max.x, bounds.max.y, bounds.max.z],
    ];
    let maxX = 0, maxY = 0;
    for (const [x, y, z] of boxCorners) {
      const p = new three.Vector3(x, y, z).project(camera);
      maxX = Math.max(maxX, Math.abs(p.x));
      maxY = Math.max(maxY, Math.abs(p.y));
    }
    const fit = Math.max(maxX / 0.83, maxY / 0.80, 0.01);
    camera.position.copy(center).addScaledVector(direction, distance * fit);
    camera.lookAt(center);
    target.render(scene, camera);
    const image = target.domElement.toDataURL("image/webp", 0.78);
    // Our GLTFLoader is private to thumbnails, so its temporary GPU resources
    // can go away once the photo has been captured.
    gltf.scene.traverse((item) => {
      if (!(item instanceof three.Mesh)) return;
      item.geometry.dispose();
      for (const material of Array.isArray(item.material) ? item.material : [item.material]) {
        for (const value of Object.values(material)) {
          if (value instanceof three.Texture) value.dispose();
        }
        material.dispose();
      }
    });
    target.renderLists.dispose();
    return image;
  } finally {
    decoder.dispose();
  }
}
