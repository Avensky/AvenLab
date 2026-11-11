import { MathUtils, SkinnedMesh, Triangle, Vector3, type BufferGeometry, type Object3D } from "three";
import { MeshBVH, type HitPointInfo } from "three-mesh-bvh";

const TORSO_DEPTH = .018;

function vestProfile(y: number, tucked: boolean) {
  const hem = tucked ? MathUtils.smoothstep(y, 1.103, 1.172)
    : MathUtils.lerp(.65, 1, MathUtils.smoothstep(y, 1.027, 1.146));
  const shoulder = MathUtils.smoothstep(y, 1.309, 1.396);
  return {
    width: 1 + .125 * hem * (1 - .76 * shoulder),
    depth: 1 + .14 * hem * (1 - .65 * shoulder),
    rise: .004 * shoulder,
  };
}

function fitShoulders(body: BufferGeometry) {
  const index = body.getIndex(), position = body.getAttribute("position"), normal = body.getAttribute("normal");
  const skinIndex = body.getAttribute("skinIndex"), skinWeight = body.getAttribute("skinWeight");
  if (!index || !position || !normal || !skinIndex || !skinWeight) return;
  // Keep the shared body index intact while searching bind-pose triangles.
  const options = { indirect: true, setBoundingBox: false };
  const surface = new MeshBVH(body, options);
  const hit: HitPointInfo = { point: new Vector3(), distance: 0, faceIndex: 0 };
  const triangle = new Triangle(), barycentric = new Vector3(), direction = new Vector3(), vertexNormal = new Vector3();
  return (geometry: BufferGeometry, vertex: number, authored: Vector3, fitted: Vector3) => {
    const blend = MathUtils.smoothstep(authored.y, 1.30, 1.374)
      * MathUtils.smoothstep(Math.abs(authored.x), .045, .107);
    if (!blend || !surface.closestPointToPoint(authored, hit, 0, .032)) return;

    const a = index.getX(hit.faceIndex * 3), b = index.getX(hit.faceIndex * 3 + 1), c = index.getX(hit.faceIndex * 3 + 2);
    triangle.setFromAttributeAndIndices(position, a, b, c);
    if (!triangle.getBarycoord(hit.point, barycentric)) return;

    const joints = geometry.getAttribute("skinIndex"), weights = geometry.getAttribute("skinWeight");
    const influences = new Map<number, number>();
    const add = (joint: number, weight: number) => influences.set(joint, (influences.get(joint) ?? 0) + weight);
    for (let channel = 0; channel < 4; channel++) {
      add(joints.getComponent(vertex, channel), (1 - blend) * weights.getComponent(vertex, channel));
      add(skinIndex.getComponent(a, channel), blend * barycentric.x * skinWeight.getComponent(a, channel));
      add(skinIndex.getComponent(b, channel), blend * barycentric.y * skinWeight.getComponent(b, channel));
      add(skinIndex.getComponent(c, channel), blend * barycentric.z * skinWeight.getComponent(c, channel));
    }
    const strongest = [...influences].sort((a, b) => b[1] - a[1] || a[0] - b[0]).slice(0, 4);
    const sum = strongest.reduce((total, [, weight]) => total + weight, 0);
    for (let channel = 0; channel < 4; channel++) {
      joints.setComponent(vertex, channel, strongest[channel]?.[0] ?? 0);
      weights.setComponent(vertex, channel, (strongest[channel]?.[1] ?? 0) / sum);
    }

    direction.set(0, 0, 0).addScaledVector(vertexNormal.fromBufferAttribute(normal, a), barycentric.x)
      .addScaledVector(vertexNormal.fromBufferAttribute(normal, b), barycentric.y)
      .addScaledVector(vertexNormal.fromBufferAttribute(normal, c), barycentric.z).normalize();
    const gap = vertexNormal.copy(fitted).sub(hit.point).dot(direction);
    fitted.addScaledVector(direction, blend * MathUtils.clamp(.0165 - gap, 0, .0145));
  };
}

/** Give the authored vest room over a shirt while keeping the tucked hem under its skirt. */
export function fitUnderbustVest(root: Object3D) {
  const body = root.getObjectByName("BODY_WARDROBE");
  const followShoulders = body instanceof SkinnedMesh ? fitShoulders(body.geometry) : undefined;
  const adjusted: { mesh: SkinnedMesh; source: BufferGeometry; fitted: BufferGeometry }[] = [];
  const direction = new Vector3(), authored = new Vector3(), point = new Vector3();
  const step = .0002;
  for (const fit of ["TUCKED", "OVER"]) {
    root.getObjectByName(`CLOTH_CORSET_${fit}`)?.traverse(mesh => {
      if (!(mesh instanceof SkinnedMesh)) return;
      const source = mesh.geometry;
      if (!source.hasAttribute("position")) return;
      const fitted = source.clone();
      const position = fitted.getAttribute("position"), normal = fitted.getAttribute("normal");
      const follow = fitted.hasAttribute("skinIndex") && fitted.hasAttribute("skinWeight") ? followShoulders : undefined;
      const tucked = fit === "TUCKED";
      for (let i = 0; i < position.count; i++) {
        authored.fromBufferAttribute(position, i);
        const { x, y } = authored, z = authored.z - TORSO_DEPTH;
        const { width, depth, rise } = vestProfile(y, tucked);
        point.set(x * width, y + rise, TORSO_DEPTH + z * depth);
        follow?.(fitted, i, authored, point);
        position.setXYZ(i, point.x, point.y, point.z);
        if (!normal) continue;
        // Match the authored normals to the same smooth expansion used for
        // fabric, piping, and fasteners so their edges continue to line up.
        const above = vestProfile(y + step, tucked), below = vestProfile(y - step, tucked);
        direction.fromBufferAttribute(normal, i);
        direction.x /= width;
        direction.z /= depth;
        direction.y = (direction.y - (direction.x * x * (above.width - below.width)
          + direction.z * z * (above.depth - below.depth)) / (2 * step))
          / (1 + (above.rise - below.rise) / (2 * step));
        direction.normalize();
        normal.setXYZ(i, direction.x, direction.y, direction.z);
      }
      fitted.computeBoundingBox();
      fitted.computeBoundingSphere();
      mesh.geometry = fitted;
      adjusted.push({ mesh, source, fitted });
    });
  }
  return () => {
    for (const { mesh, source, fitted } of adjusted) {
      mesh.geometry = source;
      fitted.dispose();
    }
  };
}
