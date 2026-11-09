/** One-shot personalized portrait using the same materials as the showroom.
 * Requests are serialized/cached by heroPortraitCache; no per-card canvases. */
import {
  AmbientLight,
  Box3,
  Color,
  DirectionalLight,
  Group,
  HemisphereLight,
  Mesh,
  OrthographicCamera,
  PMREMGenerator,
  Scene,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
  ACESFilmicToneMapping,
  type Object3D,
  type Texture,
} from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { FACTORY_APPEARANCE, type HeroAppearance } from "../../vehicles/cosmetics/heroLoadouts";
import {isDrivingScreen, useUIStore} from "../../store/menus/uiStore";
import { prepareGarageVehiclePaint, applyShowroomPaint, applyShowroomHighlights } from "./garageVehiclePaint";
import { prepareVehicleVisual } from "../../vehicles/tools/vehicleMaterials";
import { vehicleSystems } from "../../vehicles/vehicleSystems";
import { applyWindowTone, DEFAULT_WINDOW_TONE, type WindowTone } from "./windowTones";
import {
  VEHICLE_MODEL_PATHS,
  type VehicleModelId,
} from "../../vehicles/tools/vehicleModelPaths";

function requireMenu() {
  if (isDrivingScreen(useUIStore.getState().screen)) throw Error("Styled portraits are generated in menus, not during gameplay.");
}

function disposeLoadedPortrait(scene: Object3D) {
  const textures = new Set<Texture>();
  scene.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    object.geometry.dispose();
    for (const material of Array.isArray(object.material)
      ? object.material
      : [object.material])
      {
        for (const value of Object.values(material)) {
          if (value && typeof value === "object" && "isTexture" in value && value.isTexture) textures.add(value as Texture);
        }
        material.dispose();
      }
  });
  for (const texture of textures) texture.dispose();
}

export async function bakeHeroPortrait(model: VehicleModelId, appearance: HeroAppearance = FACTORY_APPEARANCE, tone: WindowTone = DEFAULT_WINDOW_TONE): Promise<string> {
  requireMenu();
  const decoder = new DRACOLoader().setDecoderPath("/draco/");
  const loader = new GLTFLoader().setDRACOLoader(decoder);
  let gltf: Awaited<ReturnType<GLTFLoader["loadAsync"]>> | undefined;
  let renderer: WebGLRenderer | undefined;
  let prepared: ReturnType<typeof prepareVehicleVisual> | undefined;
  let pmrem: PMREMGenerator | undefined;
  let room: RoomEnvironment | undefined;
  let environment: ReturnType<PMREMGenerator["fromScene"]> | undefined;
  try {
    gltf = await loader.loadAsync(VEHICLE_MODEL_PATHS[model]);
    // An in-flight menu download can finish after entering the world. Release
    // it without creating a second renderer, compiling shaders or baking PMREM.
    requireMenu();
    renderer = new WebGLRenderer({antialias:true, alpha:true, preserveDrawingBuffer:true});
    renderer.setSize(320, 216);
    renderer.setPixelRatio(1);
    renderer.outputColorSpace = SRGBColorSpace;
    renderer.toneMapping = ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.9;
    renderer.setClearColor(new Color(0x06111d), 0);
    prepared = prepareVehicleVisual(gltf.scene, model);
    prepareGarageVehiclePaint(prepared.root, model);
    applyShowroomPaint(prepared.root, model, "factory", appearance.body === "factory" ? undefined : appearance.body);
    applyShowroomHighlights(prepared.root, .45, appearance.finish, appearance.metallic, model);
    const marine = vehicleSystems(model) === "marine";
    if (!marine) applyWindowTone(prepared.glassMaterials, tone);
    const scene = new Scene();
    pmrem = new PMREMGenerator(renderer);
    room = new RoomEnvironment();
    environment = pmrem.fromScene(room, 0.04);
    scene.environment = environment.texture;
    scene.add(new HemisphereLight(0xd5efff, 0x223344, 1.2), new AmbientLight(0xffffff, 0.25));
    const key = new DirectionalLight(0xfff0d2, 2);
    key.position.set(4, 8, 6);
    scene.add(key);
    const fill = new DirectionalLight(0x79bfff, 0.8);
    fill.position.set(-6, 4, -3);
    scene.add(fill);
    const pivot = new Group();
    pivot.add(prepared.root);
    scene.add(pivot);
    const bounds = new Box3().setFromObject(prepared.root, !marine);
    const center = bounds.getCenter(new Vector3()), size = bounds.getSize(new Vector3());
    prepared.root.position.sub(center);
    pivot.scale.setScalar(4.8 / Math.max(size.x, size.y, size.z));
    pivot.rotation.y = Math.PI / 2;
    const camera = new OrthographicCamera(-3.7, 3.7, 2.5, -2.5, 0.1, 60);
    camera.zoom = 1.35;
    camera.updateProjectionMatrix();
    camera.position.set(7, 4.3, 7);
    camera.lookAt(0, 0, 0);
    renderer.render(scene, camera);
    return renderer.domElement.toDataURL("image/webp", 0.88);
  } finally {
    prepared?.dispose();
    if (gltf) disposeLoadedPortrait(gltf.scene);
    room?.dispose();
    environment?.dispose();
    pmrem?.dispose();
    decoder.dispose();
    renderer?.dispose();
    renderer?.forceContextLoss();
  }
}
