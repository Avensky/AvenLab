import { BufferGeometry, type SkinnedMesh } from "three";
import type { MeshBVH } from "three-mesh-bvh";
import { seatCoveredSkirtLayer } from "./gothicSkirtLayers";
import { wardrobeFitCache } from "./wardrobeFitCache";

/** Identify the two handkerchief drapes without depending on export vertex order. */
export function handkerchiefSkirtPanelLayers(source: BufferGeometry) {
  const index = source.getIndex(), position = source.getAttribute("position");
  if (!index || !position) return;
  const parent = Uint32Array.from({ length: position.count }, (_, i) => i);
  const used = new Uint8Array(position.count);
  const root = (vertex: number): number => {
    while (parent[vertex] !== vertex) {
      parent[vertex] = parent[parent[vertex]];
      vertex = parent[vertex];
    }
    return vertex;
  };
  for (let i = 0; i < index.count; i += 3) {
    const a = index.getX(i), b = index.getX(i + 1), c = index.getX(i + 2);
    used[a] = used[b] = used[c] = 1;
    parent[root(b)] = root(a);
    parent[root(c)] = root(a);
  }
  const components = new Map<number, { minY: number; maxY: number }>();
  for (let i = 0; i < position.count; i++) {
    if (!used[i]) continue;
    const key = root(i), y = position.getY(i);
    const bounds = components.get(key) ?? { minY: Infinity, maxY: -Infinity };
    bounds.minY = Math.min(bounds.minY, y);
    bounds.maxY = Math.max(bounds.maxY, y);
    components.set(key, bounds);
  }
  // Both drapes reach the waist. Their separate folded hem pieces and the
  // decorated waistband are much shorter and must not enter this selection.
  const panels = [...components].filter(([, { minY, maxY }]) => maxY > 1 && maxY - minY > .40)
    .sort((a, b) => a[1].minY - b[1].minY);
  let split = 0, gap = .04;
  for (let i = 1; i < panels.length; i++) {
    const difference = panels[i][1].minY - panels[i - 1][1].minY;
    if (difference > gap) { gap = difference; split = i; }
  }
  if (!split) return;
  const innerRoots = new Set(panels.slice(0, split).map(([key]) => key));
  const outerRoots = new Set(panels.slice(split).map(([key]) => key));
  const inner = new Uint8Array(position.count), outer: number[] = [];
  for (let i = 0; i < position.count; i++) inner[i] = Number(used[i] && innerRoots.has(root(i)));
  for (let i = 0; i < index.count; i += 3) {
    if (outerRoots.has(root(index.getX(i)))) outer.push(index.getX(i), index.getX(i + 1), index.getX(i + 2));
  }
  return { inner, outer };
}

const handkerchiefLayerFit = {};

/** Seat only the longer covered drape, retaining the outer cut and exposed hem. */
export function fitHandkerchiefSkirtPanels(source: BufferGeometry, body: MeshBVH) {
  return wardrobeFitCache.fit(handkerchiefLayerFit, "", [source], [body.geometry], () => [fitPanels(source, body)])[0];
}

function fitPanels(source: BufferGeometry, body: MeshBVH) {
  const panels = handkerchiefSkirtPanelLayers(source);
  if (!panels) return;
  const shell = new BufferGeometry().setAttribute("position", source.getAttribute("position")).setIndex(panels.outer);
  let fitted: BufferGeometry | undefined;
  try {
    fitted = seatCoveredSkirtLayer(source, shell, body, { lower: [.60, .66], upper: [1, 1.04], selected: panels.inner });
  } finally { shell.dispose(); }
  return fitted;
}

export function seatHandkerchiefSkirtPanels(meshes: readonly SkinnedMesh[], body: MeshBVH) {
  const fabric = meshes.find(mesh => !Array.isArray(mesh.material) && mesh.material.name === "MAT_GOTHIC_01_Fabric_1");
  if (!fabric) return;
  const fitted = fitHandkerchiefSkirtPanels(fabric.geometry, body);
  if (fitted) fabric.geometry = fitted;
  return fitted;
}
