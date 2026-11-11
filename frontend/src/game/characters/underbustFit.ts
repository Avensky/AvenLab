import { BufferAttribute, DoubleSide, MathUtils, Ray, SkinnedMesh, Triangle, Vector3, type BufferGeometry, type Object3D } from "three";
import { MeshBVH, type HitPointInfo } from "three-mesh-bvh";

import { fitWardrobeSurface } from "./wardrobeSurface.ts";

export const UNDERBUST_FIT_VERSION = 2;

function strapCut(z: number) {
  return MathUtils.lerp(1.367, 1.339, MathUtils.smoothstep(z, -.053, .042));
}

function fitStrapCrowns(body: BufferGeometry, trim = false) {
  const edge = (point: Vector3) => {
    const front = MathUtils.smoothstep(point.z, -.036, .052);
    const center = MathUtils.lerp(.102, .115, front);
    const join = MathUtils.smoothstep(point.y - strapCut(point.z), -.022, .006);
    const width = (.017 + .004 * (1 - MathUtils.smoothstep(point.y, 1.354, 1.383))) * MathUtils.lerp(.63, 1, join);
    return width - Math.abs(Math.abs(point.x) - center);
  };
  const boundaries = [
    (point: Vector3) => point.y - strapCut(point.z) + .022,
    (point: Vector3) => Math.abs(point.x) - .064,
    edge,
  ];
  if (trim) boundaries.push(point => .0026 * MathUtils.smoothstep(point.y - strapCut(point.z), -.016, .005) - edge(point));
  return fitWardrobeSurface(body, boundaries, point => {
    const crest = MathUtils.smoothstep(point.y, 1.344, 1.392);
    const front = MathUtils.smoothstep(point.z, -.030, .040);
    const join = MathUtils.smoothstep(point.y - strapCut(point.z), -.019, .010);
    return .006 + .004 * join + .003 * crest + .002 * front + (trim ? .0012 : 0);
  });
}

function replaceStrapCrowns(source: BufferGeometry, fitted: BufferGeometry, crowns?: BufferGeometry) {
  const index = source.getIndex();
  if (!index) return;
  const position = source.getAttribute("position");
  const retained: number[] = [];
  for (let i = 0; i < index.count; i += 3) {
    const a = index.getX(i), b = index.getX(i + 1), c = index.getX(i + 2);
    const x = (position.getX(a) + position.getX(b) + position.getX(c)) / 3;
    const y = (position.getY(a) + position.getY(b) + position.getY(c)) / 3;
    const z = (position.getZ(a) + position.getZ(b) + position.getZ(c)) / 3;
    if (y <= strapCut(z) || Math.abs(x) < .071) retained.push(a, b, c);
  }
  if (crowns) {
    const added = crowns.getAttribute("position"), count = position.count;
    fitted.userData.underbustCrownStart = count;
    const uv = fitted.getAttribute("uv");
    // Inherit the nearest point of the original shoulder's atlas island.
    const surface = uv && new MeshBVH(fitted, { setBoundingBox: false });
    const scratch = new Vector3(), triangle = new Triangle(), weights = new Vector3();
    const hit: HitPointInfo = { point: new Vector3(), distance: 0, faceIndex: 0 };
    const fittedIndex = fitted.getIndex()!, fittedPosition = fitted.getAttribute("position");
    for (const [name, attribute] of Object.entries(fitted.attributes)) {
      if (!(attribute instanceof BufferAttribute)) continue;
      const from = crowns.getAttribute(name);
      const ArrayType = attribute.array.constructor as { new (length: number): typeof attribute.array };
      const joined = new BufferAttribute(new ArrayType((count + added.count) * attribute.itemSize), attribute.itemSize, attribute.normalized);
      joined.array.set(attribute.array);
      for (let i = 0; i < added.count; i++) {
        if (name === "uv" && uv && surface?.closestPointToPoint(scratch.fromBufferAttribute(added, i), hit)) {
          const a = fittedIndex.getX(hit.faceIndex * 3), b = fittedIndex.getX(hit.faceIndex * 3 + 1), c = fittedIndex.getX(hit.faceIndex * 3 + 2);
          triangle.setFromAttributeAndIndices(fittedPosition, a, b, c);
          if (triangle.getBarycoord(hit.point, weights)) joined.setXY(count + i,
            weights.x * uv.getX(a) + weights.y * uv.getX(b) + weights.z * uv.getX(c),
            weights.x * uv.getY(a) + weights.y * uv.getY(b) + weights.z * uv.getY(c));
        } else if (from) {
          for (let channel = 0; channel < attribute.itemSize; channel++) joined.setComponent(count + i, channel, from.getComponent(i, channel));
        }
      }
      fitted.setAttribute(name, joined);
    }
    const addedIndex = crowns.getIndex()!;
    for (let i = 0; i < addedIndex.count; i++) retained.push(count + addedIndex.getX(i));
  }
  fitted.setIndex(retained);
  fitted.setDrawRange(0, retained.length);
}

/** Refit every source panel, seam and clasp against the Vesper bind surface. */
export function prepareUnderbustVestFit(body: BufferGeometry, fabric: readonly BufferGeometry[]) {
  const skin = body.getAttribute("position"), normals = body.getAttribute("normal"), index = body.getIndex();
  const skinJoints = body.getAttribute("skinIndex"), skinWeights = body.getAttribute("skinWeight");
  const bvhOptions = { indirect: true, setBoundingBox: false };
  const surface = new MeshBVH(body, bvhOptions);
  const panels = fabric.map(geometry => new MeshBVH(geometry, bvhOptions));
  const crowns = fitStrapCrowns(body), crownTrim = fitStrapCrowns(body, true);
  const hit: HitPointInfo = { point: new Vector3(), distance: 0, faceIndex: 0 };
  const clothHit: HitPointInfo = { point: new Vector3(), distance: 0, faceIndex: 0 };
  const anchor = new Vector3(), point = new Vector3(), normal = new Vector3(), scratch = new Vector3(), barycentric = new Vector3();
  const triangle = new Triangle();
  const influences = new Map<number, number>();
  const addInfluence = (joint: number, weight: number) => influences.set(joint, (influences.get(joint) ?? 0) + weight);
  return (source: BufferGeometry, tucked: boolean, material: string) => {
    const fitted = source.clone();
    const positions = fitted.getAttribute("position"), joints = fitted.getAttribute("skinIndex"), weights = fitted.getAttribute("skinWeight");
    if (!index || !skin || !normals || !skinJoints || !skinWeights || !positions || !joints || !weights) return fitted;
    for (let vertex = 0; vertex < positions.count; vertex++) {
      point.fromBufferAttribute(positions, vertex);
      anchor.copy(point);
      let panelDistance = .019;
      if (!fabric.includes(source)) for (const panel of panels) {
        if (!panel.closestPointToPoint(point, clothHit, 0, panelDistance)) continue;
        anchor.copy(clothHit.point);
        panelDistance = clothHit.distance;
      }
      const shoulder = MathUtils.smoothstep(anchor.y, 1.315, 1.382);
      // Draw the sewn panel inward before joining it to the body-traced crown.
      const medial = Math.sign(anchor.x) * .55 * shoulder * Math.max(0, Math.abs(anchor.x) - .088);
      anchor.x -= medial;
      point.x -= medial;
      if (!surface.closestPointToPoint(anchor, hit, 0, .085)) continue;
      const a = index.getX(hit.faceIndex * 3), b = index.getX(hit.faceIndex * 3 + 1), c = index.getX(hit.faceIndex * 3 + 2);
      triangle.setFromAttributeAndIndices(skin, a, b, c);
      if (!triangle.getBarycoord(hit.point, barycentric)) continue;
      normal.copy(scratch.fromBufferAttribute(normals, a)).multiplyScalar(barycentric.x)
        .addScaledVector(scratch.fromBufferAttribute(normals, b), barycentric.y)
        .addScaledVector(scratch.fromBufferAttribute(normals, c), barycentric.z).normalize();
      const gap = scratch.copy(anchor).sub(hit.point).dot(normal);
      const hem = tucked ? 0 : .004 * (1 - MathUtils.smoothstep(point.y, 1.015, 1.105));
      // Compress the old excess ease while preserving the relative depth of
      // seams, folds and hardware from the same source surface.
      const relief = MathUtils.clamp(gap - .007, -.003, .021);
      const clearance = .005 + .004 * shoulder + hem + .23 * relief;
      point.addScaledVector(normal, clearance - gap);
      positions.setXYZ(vertex, point.x, point.y, point.z);

      // Re-skin the fitted panels on the same surface they follow. All
      // materials get the same interpolation, keeping the trim on its seam.
      const follow = .8 + .20 * shoulder;
      influences.clear();
      for (let channel = 0; channel < 4; channel++) {
        addInfluence(joints.getComponent(vertex, channel), (1 - follow) * weights.getComponent(vertex, channel));
        addInfluence(skinJoints.getComponent(a, channel), follow * barycentric.x * skinWeights.getComponent(a, channel));
        addInfluence(skinJoints.getComponent(b, channel), follow * barycentric.y * skinWeights.getComponent(b, channel));
        addInfluence(skinJoints.getComponent(c, channel), follow * barycentric.z * skinWeights.getComponent(c, channel));
      }
      const strongest = [...influences].sort((left, right) => right[1] - left[1] || left[0] - right[0]).slice(0, 4);
      const total = strongest.reduce((sum, [, weight]) => sum + weight, 0);
      for (let channel = 0; channel < 4; channel++) {
        joints.setComponent(vertex, channel, strongest[channel]?.[0] ?? 0);
        weights.setComponent(vertex, channel, (strongest[channel]?.[1] ?? 0) / total);
      }
    }
    fitted.computeVertexNormals();
    const additions = material === "MAT_CORSET_04_05.001" ? crowns : material === "MAT_CORSET_04_00.001" ? crownTrim : undefined;
    replaceStrapCrowns(source, fitted, additions);
    fitted.computeBoundingBox();
    fitted.computeBoundingSphere();
    return fitted;
  };
}

export function isUnderbustOuterFabric(material: string) {
  return material === "MAT_CORSET_04_05.001" || material === "MAT_CORSET_04_04.001";
}

export function fitUnderbustVest(root: Object3D, body: BufferGeometry) {
  const adjusted: { mesh: SkinnedMesh; source: BufferGeometry; fitted: BufferGeometry }[] = [];
  for (const waist of ["TUCKED", "OVER"]) {
    const meshes: { mesh: SkinnedMesh; material: string }[] = [];
    root.getObjectByName(`CLOTH_CORSET_${waist}`)?.traverse(mesh => {
      if (mesh instanceof SkinnedMesh && !Array.isArray(mesh.material)) meshes.push({ mesh, material: mesh.material.name });
    });
    if (!meshes.length) continue;
    const fit = prepareUnderbustVestFit(body, meshes.filter(({ material }) => isUnderbustOuterFabric(material)).map(({ mesh }) => mesh.geometry));
    for (const { mesh, material } of meshes) {
      const source = mesh.geometry;
      const fitted = fit(source, waist === "TUCKED", material);
      mesh.geometry = fitted;
      adjusted.push({ mesh, source, fitted });
    }
  }
  return () => {
    for (const { mesh, source, fitted } of adjusted) {
      mesh.geometry = source;
      fitted.dispose();
    }
  };
}

/** Add only the room needed by the separately selected top at each point. */
export function fitUnderbustOverTop(root: Object3D, body: BufferGeometry, tops: readonly MeshBVH[]) {
  const bvhOptions = { indirect: true, setBoundingBox: false };
  const surface = new MeshBVH(body, bvhOptions);
  const skin = body.getAttribute("position"), index = body.getIndex()!;
  const point = new Vector3(), normal = new Vector3(), tangent = new Vector3(), across = new Vector3();
  const vertical = new Vector3(0, 1, 0), forward = new Vector3(0, 0, 1);
  const hit: HitPointInfo = { point: new Vector3(), distance: 0, faceIndex: 0 };
  const ray = new Ray(), triangle = new Triangle();
  const probe = .045;
  const moved: { mesh: SkinnedMesh; source: BufferGeometry; fitted: BufferGeometry }[] = [];
  function clearance(axis: Vector3, offset: number) {
    ray.origin.copy(point).addScaledVector(normal, probe).addScaledVector(axis, offset);
    let distance = probe + .0025;
    for (const top of tops) distance = top.raycastFirst(ray, DoubleSide, 0, distance)?.distance ?? distance;
    return probe - distance + .0025;
  }
  for (const waist of ["TUCKED", "OVER"]) root.getObjectByName(`CLOTH_CORSET_${waist}`)?.traverse(mesh => {
    if (!(mesh instanceof SkinnedMesh)) return;
    const source: BufferGeometry = mesh.geometry;
    const positions = source.getAttribute("position");
    let fitted: BufferGeometry | undefined;
    for (let vertex = 0; vertex < positions.count; vertex++) {
      point.fromBufferAttribute(positions, vertex);
      if (!surface.closestPointToPoint(point, hit, 0, .045)) continue;
      const face = hit.faceIndex * 3;
      triangle.setFromAttributeAndIndices(skin, index.getX(face), index.getX(face + 1), index.getX(face + 2)).getNormal(normal);
      ray.direction.copy(normal).negate();
      tangent.crossVectors(normal, Math.abs(normal.y) > .8 ? forward : vertical).normalize();
      across.crossVectors(normal, tangent);
      const delta = Math.max(clearance(tangent, 0), clearance(tangent, .004) - .003, clearance(tangent, -.004) - .003,
        clearance(across, .004) - .003, clearance(across, -.004) - .003);
      if (delta <= 0) continue;
      fitted ??= source.clone();
      point.addScaledVector(normal, delta);
      fitted.getAttribute("position").setXYZ(vertex, point.x, point.y, point.z);
    }
    if (!fitted) return;
    fitted.computeVertexNormals();
    fitted.computeBoundingBox();
    fitted.computeBoundingSphere();
    mesh.geometry = fitted;
    moved.push({ mesh, source, fitted });
  });
  return () => {
    for (const { mesh, source, fitted } of moved) {
      mesh.geometry = source;
      fitted.dispose();
    }
  };
}
