import assert from 'node:assert/strict';
import { BufferGeometry, DoubleSide, Float32BufferAttribute, Matrix4, Ray, Vector3 } from 'three';
import { MeshBVH } from 'three-mesh-bvh';

const point = new Vector3();

// Locate the underside of both cups on the intact skin. The hits identify donor
// triangles; their barycentric weights follow the same anatomy in every pose.
export function lowerBustMarkers(donor) {
  const surface = new MeshBVH(donor.geometry, { indirect: true });
  const markers = [];
  for (const x of [-.09, -.075, -.06, .06, .075, .09]) {
    const ray = new Ray(new Vector3(x, 0, .30), new Vector3(0, 0, -1));
    for (let y = 1.165; y < 1.22; y += .001) {
      ray.origin.y = y;
      const hit = surface.raycastFirst(ray, DoubleSide);
      if (hit?.face.normal.y < -.62) {
        markers.push(hit);
        break;
      }
    }
  }
  assert.equal(markers.length, 6, 'both underside creases must be sampled on Vesper');
  return markers;
}

function posedSurface(group, worldToTorso) {
  const vertices = [], faces = [];
  let crest = -Infinity;
  group.traverseVisible(mesh => {
    if (!mesh.isSkinnedMesh || mesh.userData.wardrobeRole === 'shorts') return;
    const material = mesh.material;
    const drawn = m => m?.visible && m.opacity > 0;
    if (!Array.isArray(material) && !drawn(material)) return;
    const { index, drawRange, attributes } = mesh.geometry;
    assert(index, mesh.name);
    const end = Math.min(index.count, drawRange.start + drawRange.count);
    const indices = new Int32Array(attributes.position.count).fill(-1);
    const transform = worldToTorso.clone().multiply(mesh.matrixWorld);
    const groups = Array.isArray(material)
      ? mesh.geometry.groups.filter(group => drawn(material[group.materialIndex]))
      : [drawRange];
    for (const group of groups) {
      const start = Math.max(group.start, drawRange.start), stop = Math.min(group.start + group.count, end);
      for (let face = start; face < stop; face += 3) {
        const a = index.getX(face), b = index.getX(face + 1), c = index.getX(face + 2);
        const ya = attributes.position.getY(a), yb = attributes.position.getY(b), yc = attributes.position.getY(c);
        if (Math.min(ya, yb, yc) > 1.34 || Math.max(ya, yb, yc) < .86) continue;
        for (const vertex of [a, b, c]) {
          if (indices[vertex] < 0) {
            mesh.getVertexPosition(vertex, point).applyMatrix4(transform);
            indices[vertex] = vertices.length / 3;
            vertices.push(point.x, point.y, point.z);
            crest = Math.max(crest, point.y);
          }
          faces.push(indices[vertex]);
        }
      }
    }
  });
  assert(faces.length > 0, 'visible garment geometry at the waist');
  const geometry = new BufferGeometry().setAttribute('position', new Float32BufferAttribute(vertices, 3)).setIndex(faces);
  return { surface: new MeshBVH(geometry), crest };
}

export function auditPose(model, skirt, marks, corset = model.detachedCorset.group) {
  const skin = model.root.getObjectByName('fitting-room-body') ?? model.root.getObjectByName('BODY_WARDROBE');
  const spine = skin.skeleton.bones.findIndex(bone => bone.name === 'spine_01');
  assert(spine >= 0);
  const worldToTorso = new Matrix4().multiplyMatrices(skin.skeleton.bones[spine].matrixWorld, skin.skeleton.boneInverses[spine]).invert();
  const transform = worldToTorso.clone().multiply(skin.matrixWorld);
  const underbust = Math.min(...marks.map(({ face, barycoord }) => {
    const marker = new Vector3();
    for (const [i, w] of [[face.a, barycoord.x], [face.b, barycoord.y], [face.c, barycoord.z]]) {
      marker.addScaledVector(skin.getVertexPosition(i, point), w);
    }
    return marker.applyMatrix4(transform).y;
  }));
  const band = posedSurface(skirt, worldToTorso), bodice = posedSurface(corset, worldToTorso);
  const ray = new Ray();
  let shared = 0, exposed = 0, worst = 0, maxGap = 0;
  let worstAngle = 0, worstHeight = 0;
  // Only overlapping cloth can break through. A low waistband or a split in the
  // skirt can intentionally reveal skin at an angle where the corset ends.
  const overlapAngles = new Set();
  function compare(clearance, angle, height) {
    shared++;
    if (clearance > .001) exposed++;
    if (clearance > worst) {
      worst = clearance;
      worstAngle = Math.round(angle);
      worstHeight = height;
    }
  }
  try {
    for (let angle = 0; angle < 360; angle += 5) {
      const theta = angle * Math.PI / 180, x = Math.sin(theta), z = Math.cos(theta);
      ray.direction.set(-x, 0, -z);
      let skirtTop = -Infinity, corsetBottom = Infinity;
      for (let mm = 905; mm <= 1230; mm += 4) {
        const height = mm / 1000;
        ray.origin.set(.42 * x, height, .025 + .42 * z);
        const outer = band.surface.raycastFirst(ray, DoubleSide, 0, .42);
        const inner = bodice.surface.raycastFirst(ray, DoubleSide, 0, .42);
        if (outer) skirtTop = Math.max(skirtTop, height);
        if (inner) corsetBottom = Math.min(corsetBottom, height);
        if (!outer || !inner) continue;
        overlapAngles.add(angle);
        compare(outer.distance - inner.distance, angle, height);
      }
      if (Number.isFinite(corsetBottom) && Number.isFinite(skirtTop)) maxGap = Math.max(maxGap, corsetBottom - skirtTop);
    }
    // Thin fasteners and tapered tips can sit between adjacent grid rays.
    // Check their actual posed vertices against the outermost skirt triangle.
    const cloth = bodice.surface.geometry.attributes.position;
    for (let vertex = 0; vertex < cloth.count; vertex++) {
      const height = cloth.getY(vertex);
      if (height > band.crest) continue;
      const x = cloth.getX(vertex), z = cloth.getZ(vertex) - .025;
      const radius = Math.hypot(x, z);
      if (!radius) continue;
      ray.direction.set(-x / radius, 0, -z / radius);
      ray.origin.set(-.42 * ray.direction.x, height, .025 - .42 * ray.direction.z);
      const outer = band.surface.raycastFirst(ray, DoubleSide, 0, .42);
      if (outer) compare(outer.distance - (.42 - radius), (Math.atan2(x, z) * 180 / Math.PI + 360) % 360, height);
    }
    return { bustGap: underbust - band.crest, shared, overlapAngles: overlapAngles.size, exposed, worst, worstAngle, worstHeight, maxGap };
  } finally {
    band.surface.geometry.dispose();
    bodice.surface.geometry.dispose();
  }
}
