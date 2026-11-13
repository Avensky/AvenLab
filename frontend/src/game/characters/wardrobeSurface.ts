import { BufferGeometry, Float32BufferAttribute, Uint16BufferAttribute, Uint8BufferAttribute, Vector2, Vector3 } from "three";

type Boundary = (point: Vector3) => number;
type Influence = { joint: number; weight: number };
type Vertex = { point: Vector3; normal: Vector3; influences: Influence[]; uv?: Vector2; coverage?: number };

function interpolate(a: Vertex, b: Vertex, t: number): Vertex {
  const weights = new Map<number, number>();
  for (const { joint, weight } of a.influences) weights.set(joint, (weights.get(joint) ?? 0) + weight * (1 - t));
  for (const { joint, weight } of b.influences) weights.set(joint, (weights.get(joint) ?? 0) + weight * t);
  const influences = [...weights].map(([joint, weight]) => ({ joint, weight }))
    .sort((a, b) => b.weight - a.weight || a.joint - b.joint).slice(0, 4);
  const sum = influences.reduce((total, influence) => total + influence.weight, 0);
  for (const influence of influences) influence.weight /= sum;
  return {
    point: a.point.clone().lerp(b.point, t), normal: a.normal.clone().lerp(b.normal, t), influences,
    uv: a.uv && b.uv ? a.uv.clone().lerp(b.uv, t) : undefined,
    coverage: a.coverage !== undefined && b.coverage !== undefined ? a.coverage & b.coverage : undefined,
  };
}

function clip(vertices: Vertex[], boundary: Boundary) {
  const clipped: Vertex[] = [];
  let previous = vertices[vertices.length - 1];
  let previousValue = boundary(previous.point);
  for (const current of vertices) {
    const currentValue = boundary(current.point);
    if (previousValue * currentValue < 0) clipped.push(interpolate(previous, current, previousValue / (previousValue - currentValue)));
    if (currentValue >= 0) clipped.push(current);
    previous = current;
    previousValue = currentValue;
  }
  return clipped;
}

/** Trace fabric from an undeformed body so it shares the same bone motion. */
export function fitWardrobeSurface(source: BufferGeometry, boundaries: readonly Boundary[], clearance: number | Boundary,
  preserveShellAttributes = false) {
  const position = source.getAttribute("position"), normal = source.getAttribute("normal");
  const skinIndex = source.getAttribute("skinIndex"), skinWeight = source.getAttribute("skinWeight"), index = source.getIndex();
  if (!position || !normal || !skinIndex || !skinWeight) return;
  const uv = preserveShellAttributes ? source.getAttribute("uv") : undefined;
  const coverage = preserveShellAttributes ? source.getAttribute("_aven_coverage") : undefined;

  const vertices: (Vertex | undefined)[] = [];
  function vertex(i: number) {
    if (vertices[i]) return vertices[i];
    const influences: Influence[] = [];
    for (let channel = 0; channel < 4; channel++) {
      const weight = skinWeight.getComponent(i, channel);
      if (weight > 0) influences.push({ joint: skinIndex.getComponent(i, channel), weight });
    }
    return vertices[i] = {
      point: new Vector3().fromBufferAttribute(position, i),
      normal: new Vector3().fromBufferAttribute(normal, i),
      influences,
      uv: uv ? new Vector2(uv.getX(i), uv.getY(i)) : undefined,
      coverage: coverage?.getX(i),
    };
  }

  const positions: number[] = [], normals: number[] = [], joints: number[] = [], weights: number[] = [], indices: number[] = [];
  const uvs: number[] = [], coverageValues: number[] = [];
  const vertexIndices = new Map<Vertex, number>();
  function append(vertex: Vertex) {
    const existing = vertexIndices.get(vertex);
    if (existing !== undefined) return existing;
    const i = positions.length / 3;
    const unitNormal = vertex.normal.clone().normalize();
    const distance = typeof clearance === "number" ? clearance : clearance(vertex.point);
    positions.push(...vertex.point.clone().addScaledVector(unitNormal, distance).toArray());
    normals.push(...unitNormal.toArray());
    if (vertex.uv) uvs.push(vertex.uv.x, vertex.uv.y);
    if (vertex.coverage !== undefined) coverageValues.push(vertex.coverage);
    for (let channel = 0; channel < 4; channel++) {
      joints.push(vertex.influences[channel]?.joint ?? 0);
      weights.push(vertex.influences[channel]?.weight ?? 0);
    }
    vertexIndices.set(vertex, i);
    return i;
  }

  const point = new Vector3();
  for (let i = 0; i < (index?.count ?? position.count); i += 3) {
    const a = index?.getX(i) ?? i, b = index?.getX(i + 1) ?? i + 1, c = index?.getX(i + 2) ?? i + 2;
    if (boundaries.some(boundary => boundary(point.fromBufferAttribute(position, a)) < 0
      && boundary(point.fromBufferAttribute(position, b)) < 0 && boundary(point.fromBufferAttribute(position, c)) < 0)) continue;
    let polygon = [vertex(a), vertex(b), vertex(c)];
    for (const boundary of boundaries) {
      polygon = clip(polygon, boundary);
      if (polygon.length < 3) break;
    }
    for (let j = 1; j < polygon.length - 1; j++) indices.push(append(polygon[0]), append(polygon[j]), append(polygon[j + 1]));
  }
  if (!indices.length) return;
  const geometry = new BufferGeometry()
    .setAttribute("position", new Float32BufferAttribute(positions, 3))
    .setAttribute("normal", new Float32BufferAttribute(normals, 3))
    .setAttribute("skinIndex", new Uint16BufferAttribute(joints, 4))
    .setAttribute("skinWeight", new Float32BufferAttribute(weights, 4))
    .setIndex(indices);
  if (uv) geometry.setAttribute("uv", new Float32BufferAttribute(uvs, 2));
  if (coverage) geometry.setAttribute("_aven_coverage", new Uint8BufferAttribute(coverageValues, 1));
  return geometry;
}
