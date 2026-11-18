import { DataTexture, LinearFilter, LinearMipmapLinearFilter, RepeatWrapping, Vector3, type BufferGeometry } from "three";

/** Rebuild cloth shading from the fitted surface without changing the approved cut or UV atlas. */
export function rebuildShortSkirtFabricNormals(source: BufferGeometry, fitted: BufferGeometry) {
  const originalPosition = source.getAttribute("position"), originalNormal = source.getAttribute("normal");
  const position = fitted.getAttribute("position"), normal = fitted.getAttribute("normal");
  if (!originalNormal || !normal || !fitted.index) return;

  // UV islands duplicate vertices. Join only duplicates that shared an authored
  // smooth normal, keeping deliberate creases and the two sides of a fold apart.
  const groups = new Map<string, number>(), groupForVertex = new Uint32Array(position.count);
  for (let i = 0; i < position.count; i++) {
    const key = [originalPosition.getX(i), originalPosition.getY(i), originalPosition.getZ(i)]
      .map(value => Math.round(value * 1e6)).concat(
        [originalNormal.getX(i), originalNormal.getY(i), originalNormal.getZ(i)].map(value => Math.round(value * 1e4)),
      ).join(",");
    if (!groups.has(key)) groups.set(key, groups.size);
    groupForVertex[i] = groups.get(key)!;
  }
  const sums = new Float64Array(groups.size * 3);
  const a = new Vector3(), b = new Vector3(), c = new Vector3(), face = new Vector3();
  for (let i = 0; i < fitted.index.count; i += 3) {
    const vertices: [number, number, number] = [fitted.index.getX(i), fitted.index.getX(i + 1), fitted.index.getX(i + 2)];
    a.fromBufferAttribute(position, vertices[0]);
    b.fromBufferAttribute(position, vertices[1]);
    c.fromBufferAttribute(position, vertices[2]);
    face.crossVectors(b.sub(a), c.sub(a));
    for (const vertex of vertices) {
      const offset = groupForVertex[vertex] * 3;
      sums[offset] += face.x;
      sums[offset + 1] += face.y;
      sums[offset + 2] += face.z;
    }
  }
  for (let i = 0; i < position.count; i++) {
    a.fromArray(sums, groupForVertex[i] * 3);
    if (a.lengthSq() < 1e-20) a.fromBufferAttribute(originalNormal, i);
    a.normalize();
    normal.setXYZ(i, a.x, a.y, a.z);
  }
  normal.needsUpdate = true;

  // Rebuild the UV basis against the new normals so the original seam normal
  // texture stays aligned. Degenerate UV triangles retain a projected tangent.
  if (!fitted.getAttribute("uv")) return;
  fitted.computeTangents();
  const tangent = fitted.getAttribute("tangent"), originalTangent = source.getAttribute("tangent");
  for (let i = 0; i < position.count; i++) {
    b.fromBufferAttribute(tangent, i);
    if (b.lengthSq() > .5) continue;
    a.fromBufferAttribute(normal, i);
    if (originalTangent) b.fromBufferAttribute(originalTangent, i);
    b.addScaledVector(a, -a.dot(b));
    if (b.lengthSq() < 1e-12) b.set(Math.abs(a.x) < .9 ? 1 : 0, Math.abs(a.x) < .9 ? 0 : 1, 0).cross(a);
    b.normalize();
    tangent.setXYZW(i, b.x, b.y, b.z, originalTangent?.getW(i) ?? 1);
  }
  tangent.needsUpdate = true;
}

let weave: DataTexture | undefined;

/** Fine, low-contrast threads for Skirt 02; its authored normal atlas supplies the seams. */
export function shortSkirtWeave() {
  if (weave) return weave;
  const size = 256, threadWidth = 4;
  const pixels = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = (x + .5) * 2 * Math.PI / size;
      const v = (y + .5) * 2 * Math.PI / size;
      const warp = (x + .5 + .35 * Math.sin(v * 2)) * Math.PI / threadWidth;
      const weft = (y + .5 + .3 * Math.sin(u * 3)) * Math.PI / threadWidth;
      const over = .5 + .5 * Math.cos(warp) * Math.cos(weft);
      const thread = over * Math.cos(2 * warp) + (1 - over) * Math.cos(2 * weft);
      const yarnVariation = over * Math.sin(3 * u + Math.sin(v)) + (1 - over) * Math.sin(5 * v + Math.cos(u));
      // Broad, dark yarn variation read as square stains when seen close up.
      const value = Math.round(249 + 4 * thread + 2 * yarnVariation);
      const offset = (y * size + x) * 4;
      pixels.fill(value, offset, offset + 3);
      pixels[offset + 3] = 255;
    }
  }
  weave = new DataTexture(pixels, size, size);
  weave.name = "Skirt 02 cloth weave";
  weave.wrapS = weave.wrapT = RepeatWrapping;
  weave.repeat.set(22, 22);
  weave.generateMipmaps = true;
  weave.minFilter = LinearMipmapLinearFilter;
  weave.magFilter = LinearFilter;
  weave.anisotropy = 4;
  weave.needsUpdate = true;
  return weave;
}
