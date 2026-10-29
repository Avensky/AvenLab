import {BufferGeometry, Float32BufferAttribute} from 'three';

// Six-vertex convex wedge. The high edge is -Z; the low edge is +Z.
// Rust uses the same six vertices for Rapier's convex hull.
export function createWedgeGeometry() {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute([
    -.5, -.5, .5, .5, -.5, .5, -.5, -.5, -.5,
    .5, -.5, -.5, -.5, .5, -.5, .5, .5, -.5,
  ], 3));
  geometry.setIndex([0, 1, 5, 0, 5, 4, 2, 4, 5, 2, 5, 3, 0, 2, 3, 0, 3, 1, 0, 4, 2, 1, 3, 5]);
  geometry.computeVertexNormals();
  // Flat normals keep the five physical faces visually distinct.
  const flat = geometry.toNonIndexed(); geometry.dispose(); flat.computeVertexNormals();
  return flat;
}
