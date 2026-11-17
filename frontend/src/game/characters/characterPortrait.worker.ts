import {
  ACESFilmicToneMapping, Box3, DirectionalLight, HemisphereLight, LoadingManager, OrthographicCamera,
  Scene, Vector3, WebGLRenderer,
} from "three";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { VILLAGER_ID } from "./characterCatalog";
import type { CharacterPortraitJob, CharacterPortraitResult } from "./characterPortraitJob";
import { FITTING_BODY_URL } from "./standaloneCorset";
import { prepareStylizedDriver } from "./stylizedDriverModel";
import { applyVillagerLook, prepareVillager } from "./villagerModel";

const PORTRAIT_SIZE = 192;

async function renderPortrait({ look, modelUrl, dress }: CharacterPortraitJob) {
  if (typeof OffscreenCanvas === "undefined") throw Error("Offscreen character portraits are unavailable.");

  const manager = new LoadingManager();
  const decoder = new DRACOLoader(manager).setDecoderPath("/draco/").setWorkerLimit(1);
  const loader = new GLTFLoader(manager).setDRACOLoader(decoder).setMeshoptDecoder(MeshoptDecoder);
  let model: ReturnType<typeof prepareVillager> | ReturnType<typeof prepareStylizedDriver> | undefined;
  let renderer: WebGLRenderer | undefined;
  try {
    const loadScene = (url: string) => loader.loadAsync(url).then(asset => asset.scene);
    const source = modelUrl ? await loadScene(modelUrl).catch(() => undefined) : undefined;
    if (!source && look.character.id === VILLAGER_ID) throw Error("The character model is unavailable.");

    const outfit = source && dress ? await Promise.all([loadScene(dress.url), loadScene(FITTING_BODY_URL)]).then(
      ([garment, body]) => ({ garment: { item: dress.item, scene: garment }, body: body.getObjectByName("BODY_WARDROBE") }),
      () => undefined,
    ) : undefined;
    const villager = source && prepareVillager(source, {
      female: look.female,
      garments: outfit && [outfit.garment],
      garmentBody: outfit?.body,
      removedClothing: outfit && look.removedClothing,
    });
    model = villager ?? prepareStylizedDriver(look);
    if (villager) {
      applyVillagerLook(villager, look);
      for (const name of ["CLOTH_BOTTOM_SKIRT", "CLOTH_FEET_SHOES", "CLOTH_UNDER_UNDERSKIRT", "CLOTH_BOTTOM_TROUSERS", "CLOTH_FEET_BOOTS"]) {
        const part = villager.root.getObjectByName(name);
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

    const canvas = new OffscreenCanvas(PORTRAIT_SIZE, PORTRAIT_SIZE);
    renderer = new WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true });
    renderer.setSize(PORTRAIT_SIZE, PORTRAIT_SIZE, false);
    renderer.toneMapping = ACESFilmicToneMapping;
    renderer.setClearColor(0, 0);
    renderer.render(scene, camera);
    return await canvas.convertToBlob({ type: "image/webp", quality: .90 });
  } finally {
    model?.dispose();
    renderer?.dispose();
    renderer?.forceContextLoss();
    decoder.dispose();
  }
}

self.addEventListener("message", async ({ data }: MessageEvent<CharacterPortraitJob>) => {
  let reply: CharacterPortraitResult;
  try {
    reply = { image: await renderPortrait(data) };
  } catch (error) {
    reply = { error: error instanceof Error ? error.message : "Could not create the character portrait." };
  }
  self.postMessage(reply);
}, { once: true });
