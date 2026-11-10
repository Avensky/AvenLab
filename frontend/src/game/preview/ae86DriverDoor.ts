import { BufferAttribute, BufferGeometry, Mesh, type Object3D } from "three";

// Closed geometry of the bundled AE86. The export combines disconnected
// panels into material primitives. These ranges select the right-hand door,
// its window and seals, interior card and mirror along the original seams.
const DOOR_PARTS = [
  ["Trim2.002", 89664, 14335, [-.83825, .69495, -.50002], [[21249, 22045], [29835, 29837]]],
  ["Primary.002", 88128, 5620, [-.78690, .84168, -.42218], [[10259, 13906], [29365, 29368]]],
  ["Secondary.002", 40782, 3964, [-.84616, .56641, .70122], [[7184, 7931], [13589, 13591]]],
  ["Trim1.002", 231324, 0, [-.93146, .95081, .42238], [[0, 2771], [29841, 32959], [34093, 40159],
    [55331, 56417], [77059, 77061], [77071, 77075], [77077, 77079], [77106, 77108]]],
  ["Windows.002", 38790, 1781, [-.67760, 1.06297, .04186], [[2934, 4660], [12924, 12926]]],
  ["InteriorPlastic2.002", 58776, 3642, [-.67242, .38676, -.01880], [[5777, 9488], [19584, 19585]]],
  ["InteriorPlastic.002", 307170, 32960, [-.69361, .58961, .64022], [[57935, 59139], [102311, 102313]]],
  ["Interior.002", 214224, 9594, [-.67691, .56946, .13047], [[14878, 16026]]],
  ["Mirror.002", 1512, 0, [-.97598, .87461, .40743], [[0, 252]]],
] as const;

function partition(mesh: Mesh, ranges: readonly (readonly [number, number])[]) {
  const original = mesh.geometry as BufferGeometry;
  const source = original.index!.array;
  const door = new BufferGeometry();
  const body = new BufferGeometry();
  const fixed = source.slice(0, source.length - ranges.reduce((count, [start, end]) => count + (end - start) * 3, 0));
  const moving = new Uint16Array(source.length - fixed.length);
  const remap = new Int32Array(original.attributes.position.count).fill(-1);
  const vertices: number[] = [];
  let fixedOffset = 0, movingOffset = 0, last = 0;
  for (const [start, end] of ranges) {
    fixed.set(source.subarray(last, start * 3), fixedOffset);
    fixedOffset += start * 3 - last;
    last = end * 3;
    for (let i = start * 3; i < last; i++) {
      const vertex = source[i];
      if (remap[vertex] === -1) {
        remap[vertex] = vertices.length;
        vertices.push(vertex);
      }
      moving[movingOffset++] = remap[vertex];
    }
  }
  fixed.set(source.subarray(last), fixedOffset);
  for (const [name, attribute] of Object.entries(original.attributes)) {
    body.setAttribute(name, attribute);
    const values = new Float32Array(vertices.length * attribute.itemSize);
    for (const [index, vertex] of vertices.entries()) {
      for (let component = 0; component < attribute.itemSize; component++) {
        values[index * attribute.itemSize + component] = attribute.getComponent(vertex, component);
      }
    }
    door.setAttribute(name, new BufferAttribute(values, attribute.itemSize));
  }
  body.setIndex(new BufferAttribute(fixed, 1));
  door.setIndex(new BufferAttribute(moving, 1));
  return { body, door };
}

export function splitAe86DriverDoor(root: Object3D) {
  const meshes: Mesh[] = [];
  root.traverse(object => { if (object instanceof Mesh && !Array.isArray(object.material)) meshes.push(object); });
  const matches = DOOR_PARTS.map(([material, count, vertex, point, ranges]) => {
    const mesh = meshes.find(part => !Array.isArray(part.material) && part.material.name === material &&
      part.geometry.index?.count === count);
    const position = mesh?.geometry.attributes.position;
    // Reject a different export before touching any geometry.
    if (!position || mesh?.geometry.index?.getX(ranges[0][0] * 3) !== vertex ||
      point.some((value, axis) => Math.abs(position.getComponent(vertex, axis) - value) > .0001)) return;
    return mesh;
  });
  if (matches.some(mesh => !mesh?.parent)) return;
  const parts = matches.map((match, i) => {
    const mesh = match!;
    const { body, door } = partition(mesh, DOOR_PARTS[i][4]);
    mesh.geometry = body;
    const panel = mesh.clone(false);
    panel.name = `door_right_driver_${i}`;
    panel.geometry = door;
    mesh.parent!.add(panel);
    return { body, door };
  });
  return () => parts.forEach(({ body, door }) => { body.dispose(); door.dispose(); });
}
