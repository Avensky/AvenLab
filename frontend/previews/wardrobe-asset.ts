import {
  AmbientLight, Box3, DirectionalLight, Material, Mesh, PerspectiveCamera, Scene, Texture, Vector3, WebGLRenderer,
  type Object3D,
} from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

const input = document.querySelector<HTMLInputElement>('#asset')!;
const openReview = document.querySelector<HTMLButtonElement>('#open-review')!;
const viewport = document.querySelector<HTMLDivElement>('#viewport')!;
const status = document.querySelector<HTMLParagraphElement>('#status')!;
const buttons = document.querySelectorAll<HTMLButtonElement>('button[data-angle]');
const reviewName = 'underbust-vest-review.glb';
const reviewUrl = new URL(`../wardrobe-review/${reviewName}`, window.location.href);

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

function checkGlb(buffer: ArrayBuffer) {
  const header = new DataView(buffer);
  if (header.byteLength < 12 || header.getUint32(0, true) !== 0x46546c67) {
    const prefix = new TextDecoder().decode(buffer.slice(0, 64));
    if (prefix.startsWith('version https://git-lfs.github.com/spec/v1')) {
      throw new Error('This file is a Git LFS pointer. Fetch the Git LFS asset and try again.');
    }
    if (prefix.startsWith('PK')) throw new Error('Extract the archive and choose the .glb inside.');
    throw new Error('Choose the binary .glb model file.');
  }
  if (header.getUint32(4, true) !== 2) throw new Error('The viewer requires a glTF 2.0 GLB.');
  if (header.getUint32(8, true) !== header.byteLength) throw new Error('The file is incomplete. Download the GLB again.');
}

function startViewer() {
  let renderer: WebGLRenderer;
  try {
    renderer = new WebGLRenderer({ alpha: true, antialias: true });
  } catch (error) {
    console.error('Wardrobe preview WebGL initialization failed.', error);
    status.textContent = 'The 3D viewer requires WebGL 2. Check that hardware acceleration is enabled in your browser.';
    return;
  }
  const scene = new Scene();
  const camera = new PerspectiveCamera(34, 1, .01, 20);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  viewport.append(renderer.domElement);
  const orbit = new OrbitControls(camera, renderer.domElement);
  const draco = new DRACOLoader().setDecoderPath(new URL('../draco/', window.location.href).href);
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).setDRACOLoader(draco);
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
    const direction = new Vector3(0, .04, 1);
    if (angle === 'back') direction.z = -1;
    if (angle === 'side') direction.set(1, .04, 0);
    if (angle === 'right-three-quarter') direction.set(-1, .04, 1).normalize();
    camera.position.copy(orbit.target).addScaledVector(direction, framing / Math.min(camera.aspect, 1));
    orbit.update();
    render();
  };
  orbit.addEventListener('change', render);
  new ResizeObserver(resize).observe(viewport);
  buttons.forEach(button => button.addEventListener('click', () => aim(button.dataset.angle ?? 'front')));

  const open = async (name: string, read: () => Promise<ArrayBuffer>, resourcePath = '') => {
    const pending = ++request;
    status.textContent = `Loading ${name}…`;
    try {
      const buffer = await read();
      if (pending !== request) return;
      checkGlb(buffer);
      const { scene: next } = await loader.parseAsync(buffer, resourcePath);
      next.updateMatrixWorld(true);
      const bounds = new Box3().setFromObject(next);
      const diameter = bounds.getSize(new Vector3()).length();
      if (pending !== request || bounds.isEmpty() || !Number.isFinite(diameter)) {
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
      framing = Math.max(diameter, .05) * 1.8;
      orbit.minDistance = framing * .2;
      orbit.maxDistance = framing * 5;
      camera.near = framing * .01;
      camera.far = framing * 10;
      camera.updateProjectionMatrix();
      buttons.forEach(button => { button.disabled = false; });
      aim('front');
      status.textContent = `${name} loaded. Drag to orbit and scroll to zoom.`;
    } catch (error) {
      if (pending === request) status.textContent = `Could not open ${name}. ${error instanceof Error ? error.message : ''}`;
    }
  };
  const openFile = (file?: File) => {
    if (file) void open(file.name, () => file.arrayBuffer());
  };
  input.addEventListener('change', () => {
    openFile(input.files?.[0]);
    input.value = '';
  });
  viewport.addEventListener('dragover', event => {
    if (!event.dataTransfer?.types.includes('Files')) return;
    event.preventDefault();
    viewport.dataset.dragging = '';
  });
  viewport.addEventListener('dragleave', () => { delete viewport.dataset.dragging; });
  viewport.addEventListener('drop', event => {
    event.preventDefault();
    delete viewport.dataset.dragging;
    openFile(event.dataTransfer?.files[0]);
  });
  openReview.addEventListener('click', () => {
    void open(reviewName, async () => {
      const response = await fetch(reviewUrl);
      if (!response.ok || response.headers.get('content-type')?.includes('text/html')) {
        throw new Error('Choose the downloaded GLB or place it at frontend/public/wardrobe-review/underbust-vest-review.glb.');
      }
      return response.arrayBuffer();
    }, new URL('.', reviewUrl).href);
  });
  input.disabled = false;
  openReview.disabled = false;
  status.textContent = 'Choose a .glb file or drop it into the viewer.';
}

startViewer();
