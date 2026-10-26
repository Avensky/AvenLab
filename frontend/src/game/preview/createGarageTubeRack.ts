import { Box3, BoxGeometry, CylinderGeometry, Group, InstancedMesh, Matrix4, MeshStandardMaterial, Quaternion, Vector3 } from "three";

// Complete the freestanding white light rack shown in the reference.
// Bounds supply the authored width/location; the feet sit on the display floor.
export function createGarageTubeRack(bounds: Box3) {
  const size = bounds.getSize(new Vector3());
  if (bounds.isEmpty() || Math.max(size.x, size.z) < 0.01 || size.y < 0.01) return null;
  const rack = new Group(); rack.name = "garage-white-tube-rack";
  const alongX = size.x >= size.z;
  const width = alongX ? size.x : size.z, height = size.y, radius = height * 0.016;
  const bottom = height * 0.28, top = bottom + height;
  if (alongX) rack.position.set((bounds.min.x + bounds.max.x) / 2, 0, bounds.max.z + radius * 1.5);
  else {
    rack.position.set(bounds.min.x + radius * 1.5, 0, (bounds.min.z + bounds.max.z) / 2);
    rack.rotation.y = Math.PI / 2;
  }
  const cylinder = new CylinderGeometry(1, 1, 1, 12), box = new BoxGeometry(1, 1, 1);
  const white = new MeshStandardMaterial({ metalness: 0.35, roughness: 0.3, envMapIntensity: 1 });
  white.color.setRGB(0.7, 0.74, 0.8);
  const green = new MeshStandardMaterial({ color: "#10230b", emissive: "#5bff24", emissiveIntensity: 2.2, roughness: 0.3 });
  const clamp = new MeshStandardMaterial({ color: "#3a4147", metalness: 0.4, roughness: 0.4 });
  const pipes: Matrix4[] = [], bars: Matrix4[] = [], clamps: Matrix4[] = [], feet: Matrix4[] = [];
  const up = new Vector3(0, 1, 0);
  const tube = (list: Matrix4[], from: [number, number, number], to: [number, number, number], r: number) => {
    const a = new Vector3(...from), b = new Vector3(...to), direction = b.clone().sub(a);
    list.push(new Matrix4().compose(a.add(b).multiplyScalar(0.5), new Quaternion().setFromUnitVectors(up, direction.clone().normalize()), new Vector3(r, direction.length(), r)));
  };
  const beam = (x: number, y: number, z: number, w: number, h: number, d: number) => {
    feet.push(new Matrix4().compose(new Vector3(x, y, z), new Quaternion(), new Vector3(w, h, d)));
  };
  const half = width / 2, bay = width / 3;
  for (let post = 0; post < 4; post++) {
    const x = -half + bay * post;
    tube(pipes, [x, bottom - radius * 2, 0], [x, top + radius * 3, 0], radius);
    for (const y of [bottom, bottom + height / 2, top]) {
      tube(pipes, [x, y - radius * 1.5, 0], [x, y + radius * 1.5, 0], radius * 1.6);
    }
  }
  for (const y of [bottom, top]) {
    tube(pipes, [-half - radius * 3, y, 0], [half + radius * 3, y, 0], radius);
  }
  const braceZ = -radius * 2;
  tube(pipes, [-half, bottom, braceZ], [half, top, braceZ], radius * 0.7);
  tube(pipes, [-half, top, braceZ], [half, bottom, braceZ], radius * 0.7);
  tube(pipes, [-half, bottom, braceZ], [-half + bay, top, braceZ], radius * 0.65);
  tube(pipes, [half - bay, bottom, braceZ], [half, top, braceZ], radius * 0.65);
  for (let column = 0; column < 3; column++) for (let row = 0; row < 6; row++) {
    const start = -half + bay * column + radius * 2, end = start + bay - radius * 4;
    const y = bottom + height * (0.06 + row * 0.176), z = radius * 2;
    tube(bars, [start, y, z], [end, y, z], radius * 0.42);
    for (const x of [start, end]) tube(clamps, [x - radius, y, z], [x + radius, y, z], radius * 0.7);
  }
  const footHeight = radius * 4, footDepth = width * 0.16;
  for (const x of [-half, half]) {
    beam(x, footHeight / 2, footDepth * 0.2, radius * 5, footHeight, footDepth);
    tube(pipes, [x, footHeight, 0], [x, bottom, 0], radius * 1.2);
  }
  beam(0, footHeight / 2, 0, width, footHeight, radius * 4);
  const add = (name: string, matrices: Matrix4[], geometry: CylinderGeometry | BoxGeometry, material: MeshStandardMaterial) => {
    const mesh = new InstancedMesh(geometry, material, matrices.length); mesh.name = name;
    matrices.forEach((matrix, index) => mesh.setMatrixAt(index, matrix));
    mesh.instanceMatrix.needsUpdate = true; mesh.computeBoundingSphere(); rack.add(mesh);
  };
  add("rack-white-pipes", pipes, cylinder, white);
  add("rack-green-light-bars", bars, cylinder, green);
  add("rack-light-clamps", clamps, cylinder, clamp);
  add("rack-standing-feet", feet, box, white);
  return { rack, dispose: () => {
    rack.traverse(object => { if (object instanceof InstancedMesh) object.dispose(); });
    cylinder.dispose(); box.dispose(); white.dispose(); green.dispose(); clamp.dispose();
  } };
}
