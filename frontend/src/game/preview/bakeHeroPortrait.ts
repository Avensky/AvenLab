/** Development-only portrait export. Production uses static WebP cards and
 * keeps just the existing selected-vehicle canvas. No per-card WebGL contexts. */
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
} from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { prepareVehicleVisual } from "../../vehicles/tools/vehicleMaterials";
import {
  VEHICLE_MODEL_PATHS,
  type VehicleModelId,
} from "../../vehicles/tools/vehicleModelPaths";

export async function bakeHeroPortrait(model: VehicleModelId): Promise<string> {
  const renderer = new WebGLRenderer({
    antialias: true,
    alpha: true,
    preserveDrawingBuffer: true,
  });
  renderer.setSize(320, 216);
  renderer.setPixelRatio(1);
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.9;
  renderer.setClearColor(new Color(0x06111d), 0);
  const decoder = new DRACOLoader().setDecoderPath("/draco/");
  const loader = new GLTFLoader().setDRACOLoader(decoder);
  const gltf = await loader.loadAsync(VEHICLE_MODEL_PATHS[model]);
  const prepared = prepareVehicleVisual(gltf.scene, model);
  const scene = new Scene();
  const pmrem = new PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const environment = pmrem.fromScene(room, 0.04);
  scene.environment = environment.texture;
  scene.add(
    new HemisphereLight(0xd5efff, 0x223344, 1.2),
    new AmbientLight(0xffffff, 0.25),
  );
  const key = new DirectionalLight(0xfff0d2, 2);
  key.position.set(4, 8, 6);
  scene.add(key);
  const fill = new DirectionalLight(0x79bfff, 0.8);
  fill.position.set(-6, 4, -3);
  scene.add(fill);
  const pivot = new Group();
  pivot.add(prepared.root);
  scene.add(pivot);
  const bounds = new Box3().setFromObject(prepared.root, true);
  const center = bounds.getCenter(new Vector3()),
    size = bounds.getSize(new Vector3());
  prepared.root.position.sub(center);
  pivot.scale.setScalar(4.8 / Math.max(size.x, size.y, size.z));
  pivot.rotation.y = Math.PI / 2;
  const camera = new OrthographicCamera(-3.7, 3.7, 2.5, -2.5, 0.1, 60);
  camera.zoom = 1.35;
  camera.updateProjectionMatrix();
  camera.position.set(7, 4.3, 7);
  camera.lookAt(0, 0, 0);
  renderer.render(scene, camera);
  const data = renderer.domElement.toDataURL("image/webp", 0.88);
  prepared.dispose();
  gltf.scene.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    object.geometry.dispose();
    for (const material of Array.isArray(object.material)
      ? object.material
      : [object.material])
      material.dispose();
  });
  room.dispose();
  environment.dispose();
  pmrem.dispose();
  decoder.dispose();
  renderer.dispose();
  renderer.forceContextLoss();
  return data;
}
