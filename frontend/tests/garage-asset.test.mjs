import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Box3, Matrix4, Quaternion, Vector3 } from 'three';

const path = new URL('../public/models/world/garage_special.glb', import.meta.url);
const bytes = fs.existsSync(path) ? fs.readFileSync(path) : Buffer.alloc(0);

test('the shipped garage contains evaluated ceiling arrays, mirrored rack and the complete stand base', {
  skip: bytes.subarray(0, 4).toString() !== 'glTF' ? 'Materialize the real garage GLB with Git LFS' : false,
}, () => {
  const data = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString());
  const parents = new Map(); data.nodes.forEach((node, index) => (node.children ?? []).forEach(child => parents.set(child, index)));
  const world = index => {
    const node = data.nodes[index];
    const matrix = node.matrix ? new Matrix4().fromArray(node.matrix) : new Matrix4().compose(
      new Vector3().fromArray(node.translation ?? [0, 0, 0]),
      new Quaternion().fromArray(node.rotation ?? [0, 0, 0, 1]),
      new Vector3().fromArray(node.scale ?? [1, 1, 1]),
    );
    return parents.has(index) ? world(parents.get(index)).multiply(matrix) : matrix;
  };
  const bounds = name => {
    const index = data.nodes.findIndex(node => node.name === name); assert.ok(index >= 0, `${name} is exported`);
    const node = data.nodes[index], result = new Box3(), matrix = world(index);
    for (const primitive of data.meshes[node.mesh].primitives) {
      const positions = data.accessors[primitive.attributes.POSITION];
      result.union(new Box3(new Vector3().fromArray(positions.min), new Vector3().fromArray(positions.max)).applyMatrix4(matrix));
    }
    return result;
  };
  assert.equal(data.scenes[data.scene ?? 0].extras.avenlabGarageComplete, true);
  const roof = bounds('Toit_GRILLE').getSize(new Vector3());
  assert.ok(roof.x > 250 && roof.z > 250, 'the roof covers the room, not one small Array cell');
  const wallFrame = bounds('FOND_01').getSize(new Vector3());
  assert.ok(wallFrame.x > 200 && wallFrame.z > 200, 'retain both authored sides of the upper truss');
  const rack = bounds('Base_Light').getSize(new Vector3());
  assert.ok(rack.z > 120 && rack.y > 40, 'both rack Mirror axes must be evaluated');
  const stand = bounds('PDS'), shaft = bounds('Body').getCenter(new Vector3());
  assert.ok(stand.min.x < shaft.x - 5 && stand.max.x > shaft.x + 5, 'feet extend to both sides of the shaft');
  assert.ok(!data.nodes.some(node => node.name === 'Lambo T M'), 'the embedded demo car is omitted from the selection environment');
  assert.ok(data.extensionsUsed.includes('KHR_draco_mesh_compression'));
  assert.ok(!data.extensionsUsed.includes('KHR_lights_punctual'), 'lighting stays owned by the application');
});
