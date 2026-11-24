import { BoxGeometry, Group, Mesh, MeshStandardMaterial, Vector3, type Object3D } from "three";

export type PedalName = "throttle" | "brake" | "clutch";
type Pedal = { offset: readonly [number, number, number]; width: number; throw: number; floorHinged?: boolean };
export type GaragePedalLayout = Readonly<Record<PedalName, Pedal>>;

// Right-to-left in the driver's footwell. Offsets are relative to its center.
export const BRZ_PEDAL_LAYOUT: GaragePedalLayout = {
  throttle: { offset: [-.116, .008, .157], width: .043, throw: .31, floorHinged: true },
  brake: { offset: [-.014, .040, .143], width: .067, throw: .37 },
  clutch: { offset: [.111, .040, .137], width: .060, throw: .40 },
};

export function createGaragePedalRig(car: Object3D, origin: Vector3, layout: GaragePedalLayout) {
  const root = new Group();
  root.name = "garage-drive-pedals";
  car.add(root);
  const material = new MeshStandardMaterial({ color: 0x424750, roughness: .68, metalness: .24 });
  const armMaterial = new MeshStandardMaterial({ color: 0x22242a, roughness: .86 });
  const geometries: BoxGeometry[] = [];
  const makePedal = (name: PedalName) => {
    const { offset, width, throw: arc, floorHinged } = layout[name];
    const center = origin.clone().add(new Vector3(...offset));
    const lever = new Vector3(0, floorHinged ? .078 : -.125, -.023);
    const hinge = new Group();
    hinge.name = "garage-pedal-" + name;
    hinge.position.copy(center).sub(lever);
    const face = new BoxGeometry(width, floorHinged ? .106 : .062, .014);
    const stem = new BoxGeometry(.014, Math.abs(lever.y), .018);
    geometries.push(face, stem);
    const plate = new Mesh(face, material);
    plate.position.copy(lever);
    const arm = new Mesh(stem, armMaterial);
    arm.position.copy(lever).multiplyScalar(.5);
    hinge.add(arm, plate);
    root.add(hinge);
    return (amount: number) => {
      hinge.rotation.x = (floorHinged ? 1 : -1) * arc * amount;
      return new Vector3(0, 0, -.010).add(lever).applyQuaternion(hinge.quaternion).add(hinge.position);
    };
  };
  const throttle = makePedal("throttle"), brake = makePedal("brake"), clutch = makePedal("clutch");
  return { throttle, brake, clutch, dispose() {
    root.removeFromParent();
    geometries.forEach(geometry => geometry.dispose());
    material.dispose();
    armMaterial.dispose();
  } };
}
