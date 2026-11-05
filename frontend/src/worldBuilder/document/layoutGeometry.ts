import { BoxGeometry, BufferGeometry, Float32BufferAttribute } from "three";

// Six-vertex convex wedge. The high edge is -Z; the low edge is +Z.
// Rust uses the same six vertices for Rapier's convex hull.
export function createWedgeGeometry() {
  const geometry = new BufferGeometry();
  geometry.setAttribute(
    "position",
    new Float32BufferAttribute(
      [
        -0.5, -0.5, 0.5, 0.5, -0.5, 0.5, -0.5, -0.5, -0.5, 0.5, -0.5, -0.5,
        -0.5, 0.5, -0.5, 0.5, 0.5, -0.5,
      ],
      3,
    ),
  );
  geometry.setIndex([
    0, 1, 5, 0, 5, 4, 2, 4, 5, 2, 5, 3, 0, 2, 3, 0, 3, 1, 0, 4, 2, 1, 3, 5,
  ]);
  geometry.computeVertexNormals();
  // Flat normals keep the five physical faces visually distinct.
  const flat = geometry.toNonIndexed();
  geometry.dispose();
  flat.computeVertexNormals();
  return flat;
}

// Both faces follow the same grade. The top edge matches the existing ramp,
// with a constant vertical thickness of 10% of its rise along the full run.
export function createDeckGeometry() {
  const geometry = new BoxGeometry();
  const position = geometry.attributes.position;
  for (let i = 0; i < position.count; i++)
    position.setY(i, -position.getZ(i) + .1 * (position.getY(i) - .5));
  geometry.computeVertexNormals();
  return geometry;
}
