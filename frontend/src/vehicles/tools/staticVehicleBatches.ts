import {
  BufferAttribute, BufferGeometry, Float32BufferAttribute, Material, Mesh,
  MeshPhysicalMaterial, MeshStandardMaterial, Object3D, PropertyBinding, StaticDrawUsage,
  type AnimationClip, type InterleavedBufferAttribute,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

type BatchOptions = {
  /** Controls with generic export names (for example the BRZ steering wheel). */
  protectedNames?: readonly string[];
  protectedObjects?: readonly (Object3D | null)[];
  animations?: readonly AnimationClip[];
};

type GeometryEntry = { geometry: BufferGeometry; users: number };
type StaticMesh = Mesh<BufferGeometry, MeshStandardMaterial>;
const geometries = new Map<string, GeometryEntry>();
const bufferIds = new WeakMap<object, number>();
let nextBufferId = 1;
function bufferId(buffer: object | null) {
  if (!buffer) return 0;
  let id = bufferIds.get(buffer);
  if (id === undefined) { id = nextBufferId++; bufferIds.set(buffer, id); }
  return id;
}

// These parts retain their own transform, visibility, material and picking
// identity. Parent names also protect anonymous primitives inside a GLTF group.
const independentPart = /wheel|tyre|tire|(?:^|[^a-z])rim|hub|caliper|calliper|brake|axle|suspension|steer|door|hood|trunk|boot|hatch|wiper|mirror|window|windscreen|windshield|glass|lens|lamp|light|reflector|indicator|signal|plate|turret|cannon|barrel|rotor|propeller|rudder|track|damage|break|detach|collision|collider|pivot|gauge|speedo|control|pedal|lever|gear|shift|switch|button|ignition/i;
const independentMetadata = /damage|break|animat|rig|pivot|interact|select|dynamic/i;

function componentRole(object: Object3D) {
  return String(object.userData.avenlab?.role ?? "unclassified");
}

function protectedMetadata(object: Object3D) {
  return Object.keys(object.userData).some(key => independentMetadata.test(key)) ||
    !["unclassified", "body.paint", "static"].includes(componentRole(object));
}

function animationTargets(root: Object3D, clips: readonly AnimationClip[]) {
  const targets = new Set<Object3D>();
  const all = new Set(clips);
  root.traverse(object => { for (const clip of object.animations) all.add(clip); });
  for (const clip of all) for (const track of clip.tracks) {
    try {
      const binding = PropertyBinding.parseTrackName(track.name);
      const target = PropertyBinding.findNode(root, binding.nodeName);
      // An unresolved binding may belong to an external rig. Fail closed rather
      // than remove a node that an animation will resolve after attachment.
      if (!(target instanceof Object3D)) return null;
      targets.add(target);
    } catch { return null; }
  }
  return targets;
}

function opaqueStaticMaterial(material: Material): material is MeshStandardMaterial {
  return material instanceof MeshStandardMaterial && material.visible &&
    !material.transparent && material.opacity === 1 && material.alphaTest === 0 && !material.alphaHash && !material.stencilWrite &&
    material.depthWrite && !(material instanceof MeshPhysicalMaterial && material.transmission > 0) &&
    !independentPart.test(material.name) && !/^color_b03_1$/i.test(material.name) &&
    !Object.keys(material.userData).some(key => independentMetadata.test(key));
}

function attributeLayout(geometry: BufferGeometry) {
  const layout: unknown[] = [];
  for (const name of Object.keys(geometry.attributes).sort()) {
    const attribute = geometry.getAttribute(name);
    const usage = "usage" in attribute ? attribute.usage : attribute.data.usage;
    if (usage !== StaticDrawUsage || attribute.count !== geometry.attributes.position.count) return null;
    // Positions/directions become floats before applying a transform, so a
    // quantized normal or position is not rounded back into its source format.
    const transformed = name === "position" || name === "normal" || name === "tangent";
    layout.push([name, attribute.itemSize, transformed ? "Float32Array" : attribute.array.constructor.name,
      transformed ? false : attribute.normalized, "gpuType" in attribute ? attribute.gpuType : null]);
  }
  return JSON.stringify(layout);
}

function compatibleMesh(object: Object3D): object is StaticMesh {
  const instance = (object as Object3D & { __r3f?: { eventCount: number } }).__r3f;
  if (!(object instanceof Mesh) || object.type !== "Mesh" || object.children.length || !object.visible ||
      object.userData.staticVehicleParts || instance?.eventCount ||
      Array.isArray(object.material) || !opaqueStaticMaterial(object.material) ||
      object.customDepthMaterial || object.customDistanceMaterial ||
      object.raycast !== Mesh.prototype.raycast ||
      object.onBeforeRender !== Object3D.prototype.onBeforeRender ||
      object.onAfterRender !== Object3D.prototype.onAfterRender ||
      object.onBeforeShadow !== Object3D.prototype.onBeforeShadow ||
      object.onAfterShadow !== Object3D.prototype.onAfterShadow) return false;
  const geometry = object.geometry, position = geometry.getAttribute("position");
  const normal = geometry.getAttribute("normal"), tangent = geometry.getAttribute("tangent");
  const count = geometry.index?.count ?? position?.count ?? 0;
  return Boolean(position && position.itemSize === 3 && count >= 3 && count % 3 === 0 &&
    (!normal || normal.itemSize === 3) && (!tangent || tangent.itemSize === 4) &&
    !geometry.getAttribute("skinIndex") && !geometry.getAttribute("skinWeight") &&
    !Object.keys(geometry.morphAttributes).length &&
    geometry.drawRange.start === 0 && geometry.drawRange.count >= count);
}

type VertexAttribute = BufferAttribute | InterleavedBufferAttribute;

function attributeBits(attribute: VertexAttribute) {
  const { buffer, byteOffset, byteLength, BYTES_PER_ELEMENT: bytes } = attribute.array;
  // Explicit constructors retain ArrayBufferLike support, including shared
  // source storage, without narrowing the buffer to ArrayBuffer by a cast.
  if (bytes === 1) return new Uint8Array(buffer, byteOffset, byteLength);
  if (bytes === 2) return new Uint16Array(buffer, byteOffset, byteLength / 2);
  if (bytes === 4) return new Uint32Array(buffer, byteOffset, byteLength / 4);
  return new BigUint64Array(buffer, byteOffset, byteLength / 8);
}

function sameUVAttribute(a: VertexAttribute, b: VertexAttribute) {
  if (a === b) return true;
  const usageA = "usage" in a ? a.usage : a.data.usage;
  const usageB = "usage" in b ? b.usage : b.data.usage;
  const gpuA = "gpuType" in a ? a.gpuType : undefined;
  const gpuB = "gpuType" in b ? b.gpuType : undefined;
  if (a.constructor !== b.constructor || a.array.constructor !== b.array.constructor ||
      a.count !== b.count || a.itemSize !== b.itemSize || a.normalized !== b.normalized ||
      gpuA !== gpuB || usageA !== usageB) return false;

  // Compare stored bits, not rounded floats or a sampled hash. In particular,
  // signed zero and distinct NaN payloads must not be silently equated. Views
  // also avoid allocating/deinterleaving a copy just to recognize a duplicate.
  const rawA = attributeBits(a), rawB = attributeBits(b);
  const strideA = "data" in a ? a.data.stride : a.itemSize;
  const strideB = "data" in b ? b.data.stride : b.itemSize;
  const offsetA = "offset" in a ? a.offset : 0;
  const offsetB = "offset" in b ? b.offset : 0;
  for (let vertex = 0; vertex < a.count; vertex++) for (let component = 0; component < a.itemSize; component++) {
    if (rawA[vertex * strideA + offsetA + component] !== rawB[vertex * strideB + offsetB + component]) return false;
  }
  return true;
}

function duplicateUVChannels(meshes: readonly Mesh[]) {
  const aliases = new Map<string, string>(), canonical: string[] = [];
  for (const name of Object.keys(meshes[0].geometry.attributes)) {
    if (!/^(?:uv\d*|texcoord_\d+)$/.test(name)) continue;
    const original = canonical.find(candidate => meshes.every(mesh =>
      sameUVAttribute(mesh.geometry.getAttribute(name), mesh.geometry.getAttribute(candidate))));
    if (original) aliases.set(name, original);
    else canonical.push(name);
  }
  return aliases;
}

function transformedGeometry(mesh: Mesh, uvAliases: ReadonlyMap<string, string>) {
  const geometry = new BufferGeometry();
  for (const name of Object.keys(mesh.geometry.attributes)) {
    if (uvAliases.has(name)) continue;
    const source = mesh.geometry.getAttribute(name);
    if (!["position", "normal", "tangent"].includes(name)) {
      // mergeGeometries copies these untouched attributes into its result.
      geometry.setAttribute(name, source);
    } else if (source instanceof BufferAttribute && source.array instanceof Float32Array && !source.normalized) {
      geometry.setAttribute(name, source.clone());
    } else {
      const values = new Float32Array(source.count * source.itemSize);
      for (let i = 0; i < source.count; i++) for (let c = 0; c < source.itemSize; c++)
        values[i * source.itemSize + c] = source.getComponent(i, c);
      geometry.setAttribute(name, new Float32BufferAttribute(values, source.itemSize));
    }
  }
  geometry.applyMatrix4(mesh.matrix);
  const reflected = mesh.matrix.determinant() < 0;
  geometry.setIndex(reflected ? mesh.geometry.index?.clone() ?? null : mesh.geometry.index);
  // A single material draws the entire geometry; old groups are not new draw
  // ranges. Indexing non-indexed sources also gives reflected parts a safe flip.
  if (!geometry.index) geometry.setIndex(Array.from({ length: geometry.attributes.position.count }, (_, i) => i));
  if (reflected) {
    const index = geometry.index!;
    for (let i = 0; i < index.count; i += 3) {
      const b = index.getX(i + 1);
      index.setX(i + 1, index.getX(i + 2)); index.setX(i + 2, b);
    }
    const tangent = geometry.getAttribute("tangent");
    if (tangent) for (let i = 0; i < tangent.count; i++) tangent.setW(i, -tangent.getW(i));
  }
  geometry.clearGroups();
  return geometry;
}

function geometryKey(meshes: readonly Mesh[]) {
  return JSON.stringify(meshes.map(mesh => [mesh.geometry.uuid, mesh.matrix.elements,
    bufferId(mesh.geometry.index), mesh.geometry.index?.version,
    ...Object.keys(mesh.geometry.attributes).sort().map(name => {
      const attribute = mesh.geometry.getAttribute(name);
      return [name, bufferId(attribute), attribute.count, "version" in attribute ? attribute.version : attribute.data.version];
    })]));
}

function acquireGeometry(meshes: readonly Mesh[]) {
  const key = geometryKey(meshes);
  let entry = geometries.get(key);
  if (!entry) {
    const uvAliases = duplicateUVChannels(meshes);
    const parts = meshes.map(mesh => transformedGeometry(mesh, uvAliases));
    let geometry: BufferGeometry | null;
    try { geometry = mergeGeometries(parts, false); }
    finally { for (const part of parts) part.dispose(); }
    if (!geometry) return null;
    // The canonical attribute is owned by the merged geometry. Retain every
    // channel name with the same values, sharing the BufferAttribute itself so
    // the renderer also reuses its upload. Never alias a source-owned buffer.
    for (const [name, original] of uvAliases) geometry.setAttribute(name, geometry.getAttribute(original));
    geometry.computeBoundingBox(); geometry.computeBoundingSphere();
    entry = { geometry, users: 0 };
    geometries.set(key, entry);
  }
  entry.users++;
  const acquired = entry;
  return { geometry: entry.geometry, release() {
    if (--acquired.users === 0) {
      geometries.delete(key);
      acquired.geometry.dispose();
    }
  } };
}

export type StaticVehicleBatchStats = {
  sourceMeshes: number;
  batches: number;
  /** Opaque base-pass draw ranges removed, excluding shadows/reflections. */
  savedDrawRanges: number;
  /** Unique derived attribute/index buffer storage referenced by this root. */
  geometryBytes: number;
};

/** Derive render-only meshes from compatible opaque siblings after all part
 * splitting and rig construction. Source buffers/materials are never changed.
 * Originals remain available to restore on disposal; Blender/export assets are
 * untouched. Each material/behavior batch is one draw, with no per-part groups.
 */
export function batchStaticVehicleMeshes(root: Object3D, options: BatchOptions = {}) {
  const stats: StaticVehicleBatchStats = { sourceMeshes: 0, batches: 0, savedDrawRanges: 0, geometryBytes: 0 };
  const releases: Array<() => void> = [];
  const storage = new Set<ArrayBufferLike>();
  const parentOrders = new Map<Object3D, Object3D[]>();
  const protectedObjects = animationTargets(root, options.animations ?? []);
  const names = new Set((options.protectedNames ?? []).map(name => name.toLowerCase()));
  for (const object of options.protectedObjects ?? []) if (object) protectedObjects?.add(object);
  const groups = new Map<Object3D, Map<string, StaticMesh[]>>();
  if (protectedObjects) root.traverse(object => {
    if (!compatibleMesh(object) || !object.parent) return;
    for (let node: Object3D | null = object; node; node = node.parent) {
      if (protectedObjects.has(node) || names.has(node.name.toLowerCase()) ||
          independentPart.test(node.name + " " + String(node.userData.name ?? "")) || protectedMetadata(node)) return;
      if (node === root) break;
    }
    const layout = attributeLayout(object.geometry);
    if (layout === null) return;
    if (object.matrixAutoUpdate) object.updateMatrix();
    const determinant = object.matrix.determinant();
    if (!Number.isFinite(determinant) || Math.abs(determinant) < 1e-12) return;
    const key = JSON.stringify([object.material.uuid, layout, componentRole(object), object.castShadow,
      object.receiveShadow, object.frustumCulled, object.renderOrder, object.layers.mask]);
    let siblings = groups.get(object.parent);
    if (!siblings) { siblings = new Map(); groups.set(object.parent, siblings); }
    const group = siblings.get(key) ?? [];
    group.push(object); siblings.set(key, group);
  });
  for (const [parent, siblings] of groups) for (const sources of siblings.values()) {
    if (sources.length < 2) continue;
    const owned = acquireGeometry(sources);
    if (!owned) continue;
    if (!parentOrders.has(parent)) parentOrders.set(parent, [...parent.children]);
    const first = sources[0], batch = new Mesh(owned.geometry, first.material);
    batch.name = `static-vehicle-${first.material.name || first.material.uuid}`;
    batch.castShadow = first.castShadow; batch.receiveShadow = first.receiveShadow;
    batch.frustumCulled = first.frustumCulled; batch.renderOrder = first.renderOrder; batch.layers.mask = first.layers.mask;
    // Preserve the common behavior role, but never claim a source part's unique
    // component ID for the combined object. Original metadata stays below.
    batch.userData.avenlab = { schema: first.userData.avenlab?.schema ?? 1, role: componentRole(first) };
    // This provenance is separate from geometry groups: it does not multiply
    // draws, and keeps authored part identities available to diagnostics.
    batch.userData.staticVehicleParts = sources.map(source => ({ name: source.name, uuid: source.uuid, ...source.userData }));
    for (const source of sources) parent.remove(source);
    parent.add(batch);
    stats.sourceMeshes += sources.length; stats.batches++; stats.savedDrawRanges += sources.length - 1;
    for (const attribute of [...Object.values(owned.geometry.attributes), owned.geometry.index]) {
      if (!attribute || storage.has(attribute.array.buffer)) continue;
      storage.add(attribute.array.buffer);
      stats.geometryBytes += attribute.array.buffer.byteLength;
    }
    releases.push(() => {
      batch.removeFromParent();
      for (const source of sources) parent.add(source);
      owned.release();
    });
  }
  let disposed = false;
  return { stats, dispose() {
    if (disposed) return;
    disposed = true;
    for (const release of releases) release();
    for (const [parent, order] of parentOrders) {
      const indices = new Map(order.map((child, index) => [child, index]));
      parent.children.sort((a, b) => (indices.get(a) ?? Infinity) - (indices.get(b) ?? Infinity));
    }
  } };
}
