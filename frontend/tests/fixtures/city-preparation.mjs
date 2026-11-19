import { prepareCityGpu } from "../../src/world/prepareCityGpu.ts";

// Three r181 allocates geometry storage with bufferData(target, array, usage).
// Ignore uniform/texture storage and later bufferSubData updates of live matrices.
export function trackVertexBuffers(renderer) {
  const gl = renderer.getContext(), original = gl.bufferData;
  const totals = { allocations: 0, bytes: 0 };
  gl.bufferData = function (target, data, ...args) {
    if (target === gl.ARRAY_BUFFER || target === gl.ELEMENT_ARRAY_BUFFER) {
      totals.allocations++;
      totals.bytes += typeof data === "number" ? data : data.byteLength;
    }
    return original.call(this, target, data, ...args);
  };
  return { totals, stop: () => { gl.bufferData = original; } };
}

// Run the streaming renderer's actual preparation queue and report browser-side
// time in each phase. The queue's rAF waits are included in phase elapsed time.
export async function measureCityPreparation(asset, renderer, camera, scene, shadows) {
  const phases = {};
  let current, started, lastFrame, maxFrameGapMs = 0, geometryRenders = 0, maxGeometrySubmitMs = 0;
  let cityMeshes, geometryDraws = 0, geometryTriangles = 0;
  function phase(name) {
    const now = performance.now();
    if (current) phases[current] = now - started;
    current = name;
    started = now;
    if (name === "uploading geometry") cityMeshes = new Set(asset.meshes);
  }
  function frame(time) {
    if (lastFrame !== undefined) maxFrameGapMs = Math.max(maxFrameGapMs, time - lastFrame);
    lastFrame = time;
    raf = requestAnimationFrame(frame);
  }
  let raf = requestAnimationFrame(frame);
  const buffers = trackVertexBuffers(renderer);
  const draw = renderer.renderBufferDirect;
  renderer.renderBufferDirect = function (camera, passScene, geometry, material, mesh, group) {
    if (current !== "uploading geometry" || !cityMeshes.has(mesh)) return draw.call(this, camera, passScene, geometry, material, mesh, group);
    const { calls, triangles } = this.info.render;
    draw.call(this, camera, passScene, geometry, material, mesh, group);
    geometryDraws += this.info.render.calls - calls;
    geometryTriangles += this.info.render.triangles - triangles;
  };
  const render = renderer.render;
  renderer.render = function (root, camera) {
    if (current !== "uploading geometry" || root !== asset.group.parent) return render.call(this, root, camera);
    geometryRenders++;
    const start = performance.now();
    try { return render.call(this, root, camera); }
    finally { maxGeometrySubmitMs = Math.max(maxGeometrySubmitMs, performance.now() - start); }
  };
  try {
    const start = performance.now();
    await prepareCityGpu(asset, renderer, camera, scene, new AbortController().signal, phase, shadows);
    phase(null);
    return { elapsedMs: performance.now() - start, phases, geometryRenders, geometryDraws, geometryTriangles,
      vertexBuffers: buffers.totals, maxGeometrySubmitMs, maxFrameGapMs };
  } finally {
    cancelAnimationFrame(raf);
    renderer.render = render;
    renderer.renderBufferDirect = draw;
    buffers.stop();
  }
}
