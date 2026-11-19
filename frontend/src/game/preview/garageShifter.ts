import { CylinderGeometry, Group, Mesh, MeshStandardMaterial, SphereGeometry, Vector3, type Object3D } from "three";

export function createGarageShifter(car: Object3D, neutralKnob: Vector3) {
  const height = .108;
  const shaft = new Group();
  shaft.name = "garage-preview-shifter";
  shaft.position.copy(neutralKnob).y -= height;
  const pivot = new Group();
  shaft.add(pivot);
  const bootGeometry = new CylinderGeometry(.030, .063, .032, 16);
  const leverGeometry = new CylinderGeometry(.008, .011, height, 12);
  const knobGeometry = new SphereGeometry(.026, 16, 10);
  const bootMaterial = new MeshStandardMaterial({ color: 0x211f23, roughness: .91 });
  const trim = new MeshStandardMaterial({ color: 0x41454c, roughness: .57, metalness: .38 });
  const boot = new Mesh(bootGeometry, bootMaterial);
  const lever = new Mesh(leverGeometry, trim);
  const knob = new Mesh(knobGeometry, bootMaterial);
  lever.position.y = height / 2;
  knob.position.y = height;
  knob.scale.y = 1.1;
  shaft.add(boot);
  pivot.add(lever, knob);
  car.add(shaft);
  return {
    sample(left: number, forward: number) {
      pivot.rotation.set(forward * .40, 0, -left * .36);
      return new Vector3(0, height, 0).applyQuaternion(pivot.quaternion).add(shaft.position);
    },
    dispose() {
      shaft.removeFromParent();
      bootGeometry.dispose();
      leverGeometry.dispose();
      knobGeometry.dispose();
      bootMaterial.dispose();
      trim.dispose();
    },
  };
}
