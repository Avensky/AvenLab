import { SkinnedMesh, type BufferGeometry, type Object3D } from "three";

function bonnetWithoutBow(source: BufferGeometry) {
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
  const remaining: number[] = [];
  for (let i = 0; i < index.count; i += 3) {
    if (bonnet.has(find(index.getX(i)))) remaining.push(index.getX(i), index.getX(i + 1), index.getX(i + 2));
  }
  if (!remaining.length || remaining.length === index.count) return;
  return source.clone().setIndex(remaining);
}

/** The Village export packs the chin tie and bonnet into one skinned primitive. */
export function prepareVillageBonnet(hat: Object3D | undefined) {
  if (!(hat instanceof SkinnedMesh)) return;
  const source = hat.geometry;
  let bare: BufferGeometry | null | undefined;
  return {
    setBowVisible(visible: boolean) {
      if (!visible && bare === undefined) bare = bonnetWithoutBow(source) ?? null;
      hat.geometry = visible || !bare ? source : bare;
    },
    dispose() {
      hat.geometry = source;
      bare?.dispose();
    },
  };
}
