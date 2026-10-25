import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Box3, BoxGeometry, CylinderGeometry, Group, Mesh, MeshStandardMaterial, Quaternion, Texture, Vector3 } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { CAMARO_GLASS_PARTS, prepareVehicleVisual, updateVehicleGlass } from '../src/vehicles/tools/vehicleMaterials.ts';
import { createSupraVisualRig, SUPRA_WHEEL_CORNERS } from '../src/vehicles/tools/supraVisualRig.ts';
import { applyBackendWheelPose } from '../src/vehicles/tools/vehicleVisualRig.ts';
import { measureVisualReference, solveVisualAlignment } from '../src/vehicles/tools/visualAlignment.ts';

const near = (actual, expected, tolerance = 1e-6) => assert.ok(Math.abs(actual - expected) < tolerance, `${actual} differs from ${expected}`);
const meshes = root => { const result = []; root.traverse(object => { if (object.isMesh) result.push(object); }); return result; };
const material = (name, transparent = true) => Object.assign(new MeshStandardMaterial({ transparent, opacity: 0.2, depthWrite: false }), { name });

function multipartSupra({ nested = false } = {}) {
  const scene = new Group(); scene.name = 'Scene';
  const body = new Group(); body.name = 'VEHICLE_ROOT'; body.scale.setScalar(100); scene.add(body);
  const panel = new Mesh(new BoxGeometry(0.018, 0.009, 0.042), material('ToyotaPaint_Material1'));
  panel.name = 'body'; panel.position.y = 0.008; body.add(panel);
  const window = new Mesh(new BoxGeometry(0.014, 0.002, 0.01), [material('ToyotaWindow_Material1'), material('glass_surr.001'), material('red_glass.001')]);
  window.name = 'mixed-window'; window.position.y = 0.012; body.add(window);
  let importedWheelRoot;
  if (nested) {
    const armature = new Group(); armature.name = 'Armature'; armature.scale.setScalar(0.01); armature.rotation.x = Math.PI / 2; body.add(armature);
    const wheelRoot = new Group(); wheelRoot.name = 'Wheel1A_Alpha'; wheelRoot.rotation.x = -Math.PI / 2; armature.add(wheelRoot);
    importedWheelRoot = new Group(); importedWheelRoot.name = 'Calliper_Front_R'; importedWheelRoot.userData.name = 'Calliper Front R';
    importedWheelRoot.position.set(-0.85, 0.33, 1.25); importedWheelRoot.rotation.y = Math.PI; wheelRoot.add(importedWheelRoot);
    const duplicate = new Group(); duplicate.name = 'Calliper_Front_R_1'; duplicate.userData.name = 'Calliper Front R'; importedWheelRoot.add(duplicate);
    const emptyRear = new Group(); emptyRear.name = 'Calliper_Rear_R'; emptyRear.userData.name = 'Calliper Rear R'; wheelRoot.add(emptyRear);
    importedWheelRoot = duplicate;
  }
  const positions = [[-0.85, 0.33, 1.25], [0.85, 0.33, 1.25], [-0.89, 0.33, -1.23], [0.89, 0.33, -1.23]];
  positions.forEach((position, index) => {
    const collection = new Group(); collection.name = `${SUPRA_WHEEL_CORNERS[index].toUpperCase()}_WHEEL`;
    collection.position.fromArray(position); collection.rotation.z = index % 2 ? 0.06 : -0.06;
    scene.add(collection); // Wheel collections are siblings of VEHICLE_ROOT.
    for (let part = 0; part < 3; part++) {
      const geometry = part === 2 ? new BoxGeometry(0.06, 0.1, 0.07) : new CylinderGeometry(part ? 0.23 : 0.32, part ? 0.23 : 0.32, 0.18, 16).rotateZ(Math.PI / 2);
      const mesh = new Mesh(geometry, material(part === 2 ? 'CalliperGloss_Material1' : part ? 'rim_Mat' : 'TireBlur_Material1'));
      mesh.name = `wheel-${index}-piece-${part}`; if (part === 2) mesh.position.set(0.01, 0.12, 0.1); collection.add(mesh);
    }
    if (nested) { scene.updateMatrixWorld(true); importedWheelRoot.attach(collection); }
  });
  scene.updateMatrixWorld(true);
  return scene;
}
function assertCompleteRig(scene) {
  const source = new Map(meshes(scene).map(object => [object.name, object.matrixWorld.clone()]));
  const sourceCount = source.size;
  const rig = createSupraVisualRig(scene);
  const combined = new Group(); combined.add(rig.root);
  assert.equal(rig.wheelAssemblies.length, 4);
  rig.wheelAssemblies.forEach((assembly, index) => {
    assert.ok(assembly, `${SUPRA_WHEEL_CORNERS[index]} wheel must exist`);
    combined.add(assembly.carrier);
    assert.ok(assembly.spinner.children.length >= 2);
    assert.ok(assembly.carrier.children.some(child => child !== assembly.spinner));
  });
  combined.updateMatrixWorld(true);
  const rebuilt = meshes(combined);
  assert.equal(rebuilt.length, sourceCount, 'no body or wheel fragment may be discarded or duplicated');
  for (const object of rebuilt) object.matrixWorld.elements.forEach((value, index) => near(value, source.get(object.name).elements[index]));
  assert.equal(meshes(scene).length, sourceCount, 'cached GLTF scene must remain intact');
  return rig;
}

test('Supra wheel collections beside VEHICLE_ROOT retain all fragments and authored transforms', () => {
  const rig = assertCompleteRig(multipartSupra());
  rig.dispose();
});
test('sanitized duplicate names and wheel corners nested under Front R are rebuilt without dropping meshes', () => {
  const rig = assertCompleteRig(multipartSupra({ nested: true }));
  for (const [index, assembly] of rig.wheelAssemblies.entries()) {
    const [x, y, z] = assembly.carrier.position.toArray();
    assert.equal(x < 0, index === 0 || index === 2); assert.equal(z > 0, index < 2); near(y, 0.33);
  }
  rig.dispose();
});
test('preview material repairs leave body and wheel materials opaque and window slots see-through', () => {
  const scene = multipartSupra();
  const first = prepareVehicleVisual(scene, 'supra'); const second = prepareVehicleVisual(scene, 'supra');
  const body = first.root.getObjectByName('body'); const glass = first.root.getObjectByName('mixed-window').material;
  assert.equal(body.material.transparent, false); assert.equal(body.material.opacity, 1); assert.equal(body.material.depthWrite, true);
  assert.equal(glass[0].transparent, true); assert.equal(glass[0].depthWrite, false); near(glass[0].opacity, 0.42);
  for (const slot of glass.slice(1)) { assert.equal(slot.transparent, false); assert.equal(slot.opacity, 1); }
  assert.equal(scene.getObjectByName('body').material.transparent, true, 'do not mutate useGLTF cache');
  assert.equal(body.geometry, scene.getObjectByName('body').geometry, 'geometry remains shared');
  updateVehicleGlass(first.glassMaterials, true, 1);
  near(glass[0].opacity, 0.08); near(second.root.getObjectByName('mixed-window').material[0].opacity, 0.42);
  let textureDisposals = 0;
  body.material.map = new Texture(); body.material.map.addEventListener('dispose', () => textureDisposals++);
  let materialDisposals = 0; for (const material of first.materials) material.addEventListener('dispose', () => materialDisposals++);
  first.dispose(); assert.equal(materialDisposals, first.materials.size); assert.equal(textureDisposals, 0);
  second.dispose();
});
test('Camaro preview applies the same window-part policy as its runtime TSX without making the paint transparent', () => {
  const scene = new Group(); const shared = material('ext.001'); shared.alphaTest = 0.5;
  const body = new Mesh(new BoxGeometry(), shared); body.name = 'BODY'; scene.add(body);
  for (const name of CAMARO_GLASS_PARTS) {
    const collection = new Group(); collection.name = name; collection.add(new Mesh(new BoxGeometry(), shared)); scene.add(collection);
  }
  const prepared = prepareVehicleVisual(scene, 'camaro');
  assert.equal(prepared.root.getObjectByName('BODY').material.transparent, false);
  for (const name of CAMARO_GLASS_PARTS) {
    const window = prepared.root.getObjectByName(name).children[0].material;
    assert.equal(window.transparent, true); near(window.opacity, 0.6); assert.equal(window.depthWrite, false); assert.equal(window.alphaTest, 0);
  }
  assert.equal(shared.opacity, 0.2); assert.equal(shared.alphaTest, 0.5);
  prepared.dispose();
});
test('backend wheel poses move the entire assembly and spin the imported axle while calipers stay fixed', () => {
  const rig = createSupraVisualRig(multipartSupra({ nested: true }));
  const assembly = rig.wheelAssemblies[0];
  const rotation = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), 0.7).toArray();
  const fixed = assembly.carrier.children.find(child => child !== assembly.spinner);
  applyBackendWheelPose(assembly, [10, 2, -5], rotation, 0, 0);
  assembly.carrier.updateWorldMatrix(true, true); const before = fixed.matrixWorld.clone();
  applyBackendWheelPose(assembly, [10, 2, -5], rotation, 0, 1.2);
  assembly.carrier.updateWorldMatrix(true, true);
  assert.deepEqual(assembly.carrier.position.toArray(), [10, 2, -5]);
  near(assembly.carrier.quaternion.angleTo(new Quaternion().fromArray(rotation)), 0);
  fixed.matrixWorld.elements.forEach((value, index) => near(value, before.elements[index]));
  near(assembly.axleAxis.clone().applyQuaternion(assembly.spinner.quaternion).distanceTo(assembly.axleAxis), 0);
  rig.dispose();
});

const supraPath = new URL('../public/models/vehicles/supra_2020.glb', import.meta.url);
const bytes = fs.existsSync(supraPath) ? fs.readFileSync(supraPath) : Buffer.alloc(0);
test('current Supra GLB recovers four complete wheels and a measured chassis alignment reference', { skip: bytes.subarray(0, 4).toString() !== 'glTF' ? 'Run git lfs pull for the real Supra asset' : false }, async () => {
  const loader = new GLTFLoader();
  // Mesh decoding and transforms are real. Image decoding requires a browser;
  // replace image uploads only so this test can run without a GPU or DOM.
  loader.register(parser => { parser.loadTextureImage = async () => new Texture(); return { name: 'headless-test-images' }; });
  const { scene } = await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  scene.updateMatrixWorld(true);
  const originalCount = meshes(scene).length;
  const originalBounds = new Box3().setFromObject(scene);
  const rig = createSupraVisualRig(scene);
  const assembled = new Group(); const bodyFrame = new Group(); const visual = new Group();
  assembled.add(bodyFrame); bodyFrame.add(visual); visual.add(rig.root);
  for (const assembly of rig.wheelAssemblies) { assert.ok(assembly); assembled.add(assembly.carrier); }
  assembled.updateMatrixWorld(true);
  assert.equal(meshes(assembled).length, originalCount);
  const reconstructedBounds = new Box3().setFromObject(assembled);
  near(reconstructedBounds.min.distanceTo(originalBounds.min), 0); near(reconstructedBounds.max.distanceTo(originalBounds.max), 0);
  const reference = measureVisualReference(bodyFrame, visual, rig.wheelAssemblies.map(assembly => assembly.carrier));
  const shape = { chassis_half_extents: [1, 0.36, 2.2], chassis_offset: [0, 0, 0], wheel_radius: 0.325, wheel_count: 4, nominal_wheel_center_y: -0.525 };
  const alignment = solveVisualAlignment(reference, shape);
  assert.equal(reference.samples, 4); assert.equal(alignment.status, 'aligned'); assert.ok(reference.wheelSpreadY < 0.02);
  near(reference.source[1] + alignment.offset[1], shape.nominal_wheel_center_y);
  assert.equal(rig.glassMaterials.size > 0, true);
  assert.ok(new Box3().setFromObject(rig.root).getSize(new Vector3()).length() < 10, 'import scale must remain in metres');
  rig.dispose();
});
