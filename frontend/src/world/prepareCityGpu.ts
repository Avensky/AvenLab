import { Light, Scene, WebGLRenderTarget, type Camera, type WebGLRenderer } from "three";
import type { createCityInstances } from "./cityInstances.ts";
import { cityWorkQueue } from "./cityWorkQueue.ts";

// Decode is already in Draco's workers. Spread CPU objects, texture uploads and
// vertex-buffer uploads across frame budgets, then compile the live shaders.
export async function prepareCityGpu(asset: NonNullable<ReturnType<typeof createCityInstances>>, gl: WebGLRenderer,
  camera: Camera, scene: Scene, signal: AbortSignal, phase: (value: string) => void, shadows: boolean) {
  phase("preparing meshes");
  await Promise.all(asset.objects.map(object => cityWorkQueue.enqueue(() => asset.prepareMesh(object), signal)));
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
    asset.meshes.forEach(mesh => { mesh.count = 1; mesh.castShadow = shadows; mesh.receiveShadow = shadows; });
    phase("compiling upload shaders");
    await cityWorkQueue.enqueue(() => inTarget(() => gl.compileAsync(warm, camera)), signal);
    if (signal.aborted) return;
    asset.meshes.forEach(mesh => { mesh.visible = false; mesh.count = 0; });
    phase("uploading geometry");
    await Promise.all(asset.meshes.map(mesh => cityWorkQueue.enqueue(() => {
      mesh.visible = true; mesh.count = 1;
      try { inTarget(() => gl.render(warm, camera)); }
      finally { mesh.visible = false; mesh.count = 0; }
    }, signal)));
    if (signal.aborted) return;
    warm.remove(asset.group);
    asset.meshes.forEach(mesh => { mesh.visible = true; mesh.count = 1; });
    phase("compiling city shaders");
    await cityWorkQueue.enqueue(() => gl.compileAsync(asset.group, camera, scene), signal);
  } finally { warm.remove(asset.group); target.dispose(); }
}
