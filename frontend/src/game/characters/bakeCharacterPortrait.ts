import {
  ACESFilmicToneMapping, Box3, DirectionalLight, HemisphereLight, OrthographicCamera,
  Scene, Vector3, WebGLRenderer, type Object3D,
} from "three";
import type { CharacterLook } from "./characterCatalog";
import type { WardrobeGarmentSource } from "./wardrobeGarmentFit";
import { applyVillagerLook, prepareVillager } from "./villagerModel";
import { prepareStylizedDriver } from "./stylizedDriverModel";

const portraits = new Map<string, string>();
const pendingPortraits = new Map<string, Promise<string>>();
const listeners = new Set<() => void>();
const CACHE_SIZE = 24;
let renderer: WebGLRenderer | undefined;
let release: number | undefined;

export type PortraitOutfit = { garment: WardrobeGarmentSource; body?: Object3D };

export const peekCharacterPortrait = (key: string) => portraits.get(key) ?? null;
export function subscribeCharacterPortrait(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function bakeCharacterPortrait(look: CharacterLook, key: string, source?: Object3D, outfit?: PortraitOutfit) {
  const cached = peekCharacterPortrait(key);
  if (cached) return Promise.resolve(cached);
  const pending = pendingPortraits.get(key);
  if (pending) return pending;
  const result = renderPortrait(look, source, outfit);
  pendingPortraits.set(key, result);
  void result.then(image => {
    pendingPortraits.delete(key);
    if (portraits.size >= CACHE_SIZE) portraits.delete(portraits.keys().next().value!);
    portraits.set(key, image);
    for (const listener of listeners) listener();
  }, () => { pendingPortraits.delete(key); });
  return result;
}

function encodePortrait(canvas: HTMLCanvasElement) {
  return new Promise<string>((resolve, reject) => {
    canvas.toBlob(blob => {
      if (!blob) { reject(Error("Character portrait encoding failed.")); return; }
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    }, "image/webp", .90);
  });
}

async function renderPortrait(look: CharacterLook, source?: Object3D, outfit?: PortraitOutfit) {
  if (!renderer) {
    renderer = new WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
    renderer.setSize(192, 192);
    renderer.toneMapping = ACESFilmicToneMapping;
    renderer.setClearColor(0, 0);
  }
  window.clearTimeout(release);
  release = window.setTimeout(() => {
    renderer?.dispose();
    renderer?.forceContextLoss();
    renderer = undefined;
  }, 3000);

  const villager = source && prepareVillager(source, {
    female: look.female,
    garments: outfit && [outfit.garment],
    garmentBody: outfit?.body,
    removedClothing: outfit && look.removedClothing,
  });
  const model = villager ?? prepareStylizedDriver(look);
  try {
    if (villager) {
      applyVillagerLook(villager, look);
      for (const name of ["CLOTH_BOTTOM_SKIRT", "CLOTH_FEET_SHOES", "CLOTH_UNDER_UNDERSKIRT", "CLOTH_BOTTOM_TROUSERS", "CLOTH_FEET_BOOTS"]) {
        const part = model.root.getObjectByName(name);
        if (part) part.visible = false;
      }
    }
    const head = "face" in model ? model.face : model.root.getObjectByName("head");
    if (!head) throw Error("The character portrait needs a head anchor.");
    const scene = new Scene();
    const keyLight = new DirectionalLight(0xffefe1, 2);
    keyLight.position.set(3, 4, 5);
    scene.add(model.root, keyLight, new HemisphereLight(0xe5eeff, 0x73685e, 1.25));

    model.root.updateMatrixWorld(true);
    const center = villager
      ? head.getWorldPosition(new Vector3()).add(new Vector3(0, .075, .018))
      : new Box3().setFromObject(head).getCenter(new Vector3());
    const camera = new OrthographicCamera(-.20, .20, .20, -.20, .1, 10);
    camera.position.copy(center).add(new Vector3(.4, .08, 2));
    camera.lookAt(center);
    renderer.render(scene, camera);
    return encodePortrait(renderer.domElement);
  } finally {
    model.dispose();
  }
}
