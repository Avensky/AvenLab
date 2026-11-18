import { SkinnedMesh, Vector3, type BufferGeometry, type Object3D } from "three";

function splitChinBow(source: BufferGeometry) {
  const index = source.getIndex(), position = source.getAttribute("position");
  if (!index || !position) return;

  const parents = Uint32Array.from({ length: position.count }, (_, i) => i);
  function find(vertex: number) {
    while (parents[vertex] !== vertex) {
      parents[vertex] = parents[parents[vertex]];
      vertex = parents[vertex];
    }
    return vertex;
  }

  // Join vertices split at UV seams before identifying the ribbon islands.
  const byPosition = new Map<string, number>();
  for (let i = 0; i < position.count; i++) {
    const key = [position.getX(i), position.getY(i), position.getZ(i)].map(value => Math.round(value * 1e5)).join(",");
    const duplicate = byPosition.get(key);
    if (duplicate === undefined) byPosition.set(key, i);
    else parents[i] = duplicate;
  }
  for (let i = 0; i < index.count; i += 3) {
    const root = find(index.getX(i));
    parents[find(index.getX(i + 1))] = root;
    parents[find(index.getX(i + 2))] = root;
  }

  const bonnet = new Set<number>();
  for (let i = 0; i < position.count; i++) {
    // The tie is clustered in front of the chin, clear of the bonnet crown.
    const x = position.getX(i), y = position.getY(i), z = position.getZ(i);
    if (x < -.007 || x > .098 || y > 1.473 || z < .004 || z > .095) bonnet.add(find(i));
  }
  const crown: number[] = [], tie: number[] = [];
  for (let i = 0; i < index.count; i += 3) {
    const faces = bonnet.has(find(index.getX(i))) ? crown : tie;
    faces.push(index.getX(i), index.getX(i + 1), index.getX(i + 2));
  }
  if (!crown.length || !tie.length) return;
  return { indices: crown.concat(tie), crownCount: crown.length, tieVertices: new Set(tie) };
}

function fitChinBow(source: BufferGeometry, parts: NonNullable<ReturnType<typeof splitChinBow>>) {
  const geometry = source.clone().setIndex(parts.indices);
  const position = geometry.getAttribute("position"), normal = geometry.getAttribute("normal");
  const tangent = geometry.getAttribute("tangent"), direction = new Vector3();
  // Keep the attachment beside the jaw fixed. Shorten the hanging ribbon and
  // curve it gently forward of the collar, capped at 14 mm over the chest.
  const knotY = 1.463, lift = .4, forward = .014, bendLength = .04;
  for (const i of parts.tieVertices) {
    const y = position.getY(i), drop = knotY - y;
    if (drop <= 0) continue;
    const bend = Math.exp(-drop / bendLength), slope = forward / bendLength * bend;
    position.setY(i, y + lift * drop);
    position.setZ(i, position.getZ(i) + forward * (1 - bend));
    // Transform the authored shading frame along with the ribbon folds.
    if (normal) {
      direction.fromBufferAttribute(normal, i);
      direction.y = (direction.y + slope * direction.z) / (1 - lift);
      direction.normalize();
      normal.setXYZ(i, direction.x, direction.y, direction.z);
    }
    if (tangent) {
      direction.fromBufferAttribute(tangent, i);
      direction.z -= slope * direction.y;
      direction.y *= 1 - lift;
      direction.normalize();
      tangent.setXYZ(i, direction.x, direction.y, direction.z);
    }
  }
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

// A CPU-only template amortizes island detection and fitting across actors.
// Each visible bonnet owns its draw range and the buffers it disposes.
type BonnetTemplate = { geometry: BufferGeometry; crownCount: number };
const templates = new WeakMap<BufferGeometry, BonnetTemplate | null>();

function bonnetTemplate(source: BufferGeometry) {
  const cached = templates.get(source);
  if (cached !== undefined) return cached;
  const parts = splitChinBow(source);
  const template = parts ? { geometry: fitChinBow(source, parts), crownCount: parts.crownCount } : null;
  templates.set(source, template);
  return template;
}

/** The Village export packs the chin tie and bonnet into one skinned primitive. */
export function prepareVillageBonnet(hat: Object3D | undefined) {
  if (!(hat instanceof SkinnedMesh)) return;
  const source = hat.geometry;
  let fitted: BufferGeometry | undefined;
  let crownCount = 0;
  return {
    setBowVisible(visible: boolean) {
      if (!fitted) {
        const template = bonnetTemplate(source);
        if (!template) return;
        fitted = template.geometry.clone();
        crownCount = template.crownCount;
        hat.geometry = fitted;
      }
      fitted.setDrawRange(0, visible ? fitted.getIndex()!.count : crownCount);
    },
    dispose() {
      hat.geometry = source;
      fitted?.dispose();
    },
  };
}
