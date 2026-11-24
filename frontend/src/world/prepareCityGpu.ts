import { Light, MeshPhysicalMaterial, Scene, WebGLRenderTarget, type Camera, type WebGLRenderer } from "three";
import type { createCityInstances } from "./cityInstances.ts";
import { cityWorkQueue } from "./cityWorkQueue.ts";
import { warmCityMesh, type CityRenderMesh } from "./cityDrawBatches.ts";

// Keep the queue's yield points close together. A large upload gets its own
// turn. Transmissive surfaces stay alone so they cannot redraw opaque siblings.
function* geometryUploadGroups(meshes: readonly CityRenderMesh[]) {
  const byteBudget = 256 * 1024;
  let group: CityRenderMesh[] = [], bytes = 0;
  for (const mesh of meshes) {
    const { geometry, material } = mesh;
    let size = geometry.index?.array.byteLength ?? 0;
    for (const attribute of Object.values(geometry.attributes)) size += attribute.array.byteLength;
    const materials = Array.isArray(material) ? material : [material];
    const separate = size >= byteBudget || materials.some(slot => slot instanceof MeshPhysicalMaterial && slot.transmission > 0);
    if (group.length && (separate || group.length === 4 || bytes + size > byteBudget)) {
      yield group;
      group = [];
      bytes = 0;
    }
    if (separate) {
      yield [mesh];
    } else {
      group.push(mesh);
      bytes += size;
    }
  }
  if (group.length) yield group;
}

// Leave proxies on screen while previously submitted GL work drains. A zero
// timeout polls once per queue turn without blocking the animation callback.
async function waitForCityUploads(renderer: WebGLRenderer, signal: AbortSignal) {
  const gl = renderer.getContext() as WebGL2RenderingContext;
  const fence = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
  if (!fence) return;
  try {
    gl.flush();
    while (!signal.aborted) {
      const result = await cityWorkQueue.enqueue(() => gl.clientWaitSync(fence, 0, 0), signal);
      if (result !== gl.TIMEOUT_EXPIRED) break;
    }
  } finally { gl.deleteSync(fence); }
}

// Decode is already in Draco's workers. Spread CPU objects, texture uploads and
// vertex-buffer uploads across frame budgets, then compile the live shaders.
export async function prepareCityGpu(asset: NonNullable<ReturnType<typeof createCityInstances>>, gl: WebGLRenderer,
  camera: Camera, scene: Scene, signal: AbortSignal, phase: (value: string) => void, shadows: boolean) {
  phase("preparing meshes");
  await Promise.all(asset.objects.map(object => cityWorkQueue.enqueue(() => asset.prepareMesh(object), signal)));
  if (signal.aborted) return;
  phase("batching compatible materials");
  await Promise.all(asset.prepareDrawBatches().map(job => cityWorkQueue.enqueue(job, signal)));
  if (signal.aborted) return;
  phase("uploading textures");
  await Promise.all([...asset.textures].map(texture => cityWorkQueue.enqueue(() => gl.initTexture(texture), signal)));
  if (signal.aborted) return;
  const target = new WebGLRenderTarget(1, 1), warm = new Scene();
  warm.environment = scene.environment; warm.environmentIntensity = scene.environmentIntensity; warm.fog = scene.fog;
  scene.traverseVisible(object => { if (object instanceof Light) {
    const light = object.clone(); light.castShadow = false; object.updateWorldMatrix(true, false); light.applyMatrix4(object.parent?.matrixWorld ?? object.matrixWorld.clone().identity()); warm.add(light);
  } });
  warm.add(asset.group);
  const inTarget = <T,>(work: () => T) => {
    const previous = gl.getRenderTarget(), face = gl.getActiveCubeFace(), mip = gl.getActiveMipmapLevel();
    const xr = gl.xr.enabled, shadowUpdate = gl.shadowMap.autoUpdate;
    try { gl.xr.enabled = false; gl.shadowMap.autoUpdate = false; gl.setRenderTarget(target); return work(); }
    finally { gl.setRenderTarget(previous, face, mip); gl.xr.enabled = xr; gl.shadowMap.autoUpdate = shadowUpdate; }
  };
  try {
    asset.meshes.forEach(mesh => { warmCityMesh(mesh, true); mesh.castShadow &&= shadows; mesh.receiveShadow = shadows; });
    phase("compiling upload shaders");
    await cityWorkQueue.enqueue(() => inTarget(() => gl.compileAsync(warm, camera)), signal);
    if (signal.aborted) return;
    asset.meshes.forEach(mesh => warmCityMesh(mesh, false));
    phase("uploading geometry");
    let uploadFailed = false;
    await Promise.all(Array.from(geometryUploadGroups(asset.meshes), group => cityWorkQueue.enqueue(() => {
      if (uploadFailed) return;
      try {
        for (const mesh of group) {
          // Three binds attributes and instance data before checking the draw
          // count. Keep its representative sort bound, then upload with zero
          // instances so the 1px warmup does not rasterize the city.
          if (gl.sortObjects && mesh.boundingSphere === null) {
            warmCityMesh(mesh, true);
            mesh.computeBoundingSphere();
            warmCityMesh(mesh, false);
          }
          mesh.visible = true;
        }
        inTarget(() => gl.render(warm, camera));
      } catch (error) {
        uploadFailed = true;
        throw error;
      } finally {
        group.forEach(mesh => warmCityMesh(mesh, false));
      }
    }, signal)));
    if (signal.aborted) return;
    warm.remove(asset.group);
    asset.meshes.forEach(mesh => warmCityMesh(mesh, true));
    phase("compiling city shaders");
    await cityWorkQueue.enqueue(() => gl.compileAsync(asset.group, camera, scene), signal);
    if (signal.aborted) return;
    phase("waiting for GPU uploads");
    await waitForCityUploads(gl, signal);
  } finally { asset.meshes.forEach(mesh => warmCityMesh(mesh, false)); warm.remove(asset.group); target.dispose(); }
}
