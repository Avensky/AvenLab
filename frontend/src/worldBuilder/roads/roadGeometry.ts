// Split merged sidewalk meshes by connected surface, so a joined intersection
// still has four independently switchable corners. Weld keys are used only for
// connectivity: the returned coordinates are the unmodified source vertices.
import type { RawPart } from "../roadKit/roadKitCore.ts";
export function splitSidewalks(part: RawPart): RawPart[] {
  if (!/^Sidewalk_/.test(part.material)) return [part];
  const count = part.indices.length / 3,
    parent = Array.from({ length: count }, (_, i) => i),
    owner = new Map<string, number>();
  const root = (i: number): number => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  };
  for (let t = 0; t < count; t++)
    for (let k = 0; k < 3; k++) {
      const v = part.indices[t * 3 + k] * 3,
        key = part.positions
          .slice(v, v + 3)
          .map((n) => Math.round(n * 100000))
          .join(",");
      const first = owner.get(key);
      if (first === undefined) owner.set(key, t);
      else parent[root(t)] = root(first);
    }
  const groups = new Map<number, number[]>();
  for (let t = 0; t < count; t++) {
    const id = root(t),
      list = groups.get(id) ?? [];
    list.push(...part.indices.slice(t * 3, t * 3 + 3));
    groups.set(id, list);
  }
  return [...groups.values()].map((source, component) => {
    const positions: number[] = [],
      indices: number[] = [],
      remap = new Map<number, number>();
    for (const v of source) {
      if (!remap.has(v)) {
        remap.set(v, positions.length / 3);
        positions.push(...part.positions.slice(v * 3, v * 3 + 3));
      }
      indices.push(remap.get(v)!);
    }
    return { ...part, id: `${part.id}-${component}`, positions, indices };
  });
}
