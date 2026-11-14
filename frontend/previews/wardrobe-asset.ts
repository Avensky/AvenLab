import {
  AmbientLight, Box3, DirectionalLight, Material, Mesh, PerspectiveCamera, Scene, Texture, Vector3, WebGLRenderer,
  type Object3D,
} from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

const input = document.querySelector<HTMLInputElement>('#asset')!;
const viewport = document.querySelector<HTMLDivElement>('#viewport')!;
const status = document.querySelector<HTMLParagraphElement>('#status')!;
const buttons = document.querySelectorAll<HTMLButtonElement>('button[data-angle]');

function release(root: Object3D) {
  const materials = new Set<Material>();
  const textures = new Set<Texture>();
  root.traverse(part => {
    if (!(part instanceof Mesh)) return;
    part.geometry.dispose();
    for (const material of Array.isArray(part.material) ? part.material : [part.material]) materials.add(material);
  });
  for (const material of materials) {
    for (const value of Object.values(material)) if (value instanceof Texture) textures.add(value);
    material.dispose();
  }
  for (const texture of textures) texture.dispose();
}

try {
  const scene = new Scene();
  const camera = new PerspectiveCamera(34, 1, .01, 20);
  const renderer = new WebGLRenderer({ alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  viewport.append(renderer.domElement);
  const orbit = new OrbitControls(camera, renderer.domElement);
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const key = new DirectionalLight('#fff0dc', 3);
  const fill = new DirectionalLight('#dbebff', 1.6);
  key.position.set(2, 4, 3);
  fill.position.set(-2, 2, -3);
  scene.add(key, fill, new AmbientLight('#e5edf8', 1.4));

  let model: Object3D | undefined;
  let framing = 1;
  let request = 0;
  const render = () => renderer.render(scene, camera);
  const resize = () => {
    const { clientWidth: width, clientHeight: height } = viewport;
    camera.aspect = width / Math.max(height, 1);
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
    render();
  };
  const aim = (angle: string) => {
    const direction = angle === 'back' ? new Vector3(0, .04, -1)
      : angle === 'side' ? new Vector3(1, .04, 0) : new Vector3(0, .04, 1);
    camera.position.copy(orbit.target).addScaledVector(direction, framing / Math.min(camera.aspect, 1));
    orbit.update();
    render();
  };
  orbit.addEventListener('change', render);
  new ResizeObserver(resize).observe(viewport);
  buttons.forEach(button => button.addEventListener('click', () => aim(button.dataset.angle ?? 'front')));
  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    if (!file) return;
    const pending = ++request;
    status.textContent = `Loading ${file.name}…`;
    try {
      const { scene: next } = await loader.parseAsync(await file.arrayBuffer(), '');
      const bounds = new Box3().setFromObject(next);
      if (pending !== request || bounds.isEmpty()) {
        release(next);
        if (pending === request) throw new Error('The file contains no visible geometry.');
        return;
      }
      if (model) {
        scene.remove(model);
        release(model);
      }
      model = next;
      scene.add(model);
      bounds.getCenter(orbit.target);
      framing = Math.max(bounds.getSize(new Vector3()).length(), .05) * 1.8;
      orbit.minDistance = framing * .2;
      orbit.maxDistance = framing * 5;
      buttons.forEach(button => { button.disabled = false; });
      aim('front');
      status.textContent = file.name;
    } catch (error) {
      if (pending === request) status.textContent = `Could not open ${file.name}. ${error instanceof Error ? error.message : ''}`;
    }
  });
} catch {
  input.disabled = true;
  status.textContent = 'WebGL is unavailable in this browser.';
}
