import { CapsuleGeometry, CylinderGeometry, Group, Mesh, MeshStandardMaterial, SphereGeometry, Vector3, type BufferGeometry } from "three";
import type { CharacterLook } from "./characterCatalog";

type Point = [number, number, number];

export function prepareStylizedDriver(look: CharacterLook) {
  const { female, fabric, skin, hair, appearance, outfit } = look;
  const trim = outfit.trim;
  const shoulders = female ? .155 : .205;
  const crop = appearance.hair === "cropped";
  const hat = appearance.headwear === "hat";
  const root = new Group();
  root.name = female ? "garage-mara-stylized" : "garage-jules-stylized";
  const sphere = new SphereGeometry(1, 16, 12);
  const geometries = new Set<BufferGeometry>([sphere]);
  const materials = new Map<string, MeshStandardMaterial>();
  const up = new Vector3(0, 1, 0);
  function mesh(geometry: BufferGeometry, color: string) {
    let material = materials.get(color);
    if (!material) {
      material = new MeshStandardMaterial({ color, roughness: .85 });
      materials.set(color, material);
    }
    geometries.add(geometry);
    const part = new Mesh(geometry, material);
    root.add(part);
    return part;
  }
  function form(at: Point, size: Point, color: string, rotation?: Point) {
    const part = mesh(sphere, color);
    part.position.set(...at);
    part.scale.set(...size);
    if (rotation) part.rotation.set(...rotation);
    return part;
  }
  function limb(from: Point, to: Point, radius: number, color: string) {
    const start = new Vector3(...from);
    const direction = new Vector3(...to).sub(start);
    const height = Math.max(.01, direction.length() - radius * 1.2);
    const part = mesh(new CapsuleGeometry(radius, height, 4, 10), color);
    part.position.copy(start.addScaledVector(direction, .5));
    part.quaternion.setFromUnitVectors(up, direction.normalize());
  }
  for (const side of [-1, 1]) {
    const x = side * .115;
    const knee: Point = [x + side * .017, .49, side * .025];
    const ankle: Point = [x + side * .04, .13, side * .065];
    limb([x * .76, .90, 0], knee, .082, "#222c38");
    limb(knee, ankle, .064, "#273443");
    form([ankle[0], .087, ankle[2] + .052], [.073, .08, .141], "#17212b", [0, side * .11, 0]);
    form([ankle[0], .038, ankle[2] + .065], [.074, .033, .137], "#384450");
  }
  if (female) {
    const skirt = mesh(new CylinderGeometry(.14, .262, .54, 18), fabric);
    skirt.position.y = .658;
    skirt.scale.z = .79;
  } else {
    form([0, .87, 0], [.185, .132, .112], "#222c38");
  }
  form([0, 1.14, 0], [shoulders + .018, .29, .122], fabric);
  form([0, 1.13, .114], [.032, .235, .013], female ? trim : "#17212b");
  form([0, .938, .006], [female ? .154 : .19, .044, .119], "#282635");
  if (outfit.id !== "dockwear" && outfit.id !== "night-run") form([-.09, 1.28, .108], [.049, .026, .012], trim);
  limb([-shoulders, 1.31, 0], [-shoulders - .065, 1.05, -.02], .067, fabric);
  limb([-shoulders - .065, 1.05, -.02], [-.125, .956, .112], .057, fabric);
  form([-.108, .947, .129], [.048, .045, .047], skin);
  limb([shoulders, 1.31, 0], [shoulders + .066, 1.09, .047], .069, fabric);
  limb([shoulders + .066, 1.09, .047], [.112, 1.22, .188], .056, fabric);
  form([.079, 1.238, .197], [.048, .046, .04], skin);
  form([0, 1.428, 0], [.062, .085, .059], skin);
  const face = form([0, 1.57, 0], [.104, .143, .1], skin);
  form([0, 1.54, .102], [.022, .036, .033], skin);
  for (const side of [-1, 1]) {
    form([side * .098, 1.554, 0], [.024, .038, .023], skin);
    form([side * .043, 1.579, .092], [.020, .008, .012], "#241d26");
    form([side * .043, 1.602, .093], [.023, .006, .009], hair, [0, side * .18, side * .1]);
  }
  form([0, 1.496, .089], [.036, .005, .018], "#663c37");
  form([0, 1.657, -.013], [.106, crop ? .058 : .083, .104], hair);
  if (!crop && female) form([0, 1.558, -.062], [.111, .153, .07], hair);
  if (!crop && !female && !hat) form([-.019, 1.698, -.015], [.084, .051, .094], hair, [0, 0, -.18]);
  if (hat) {
    form([0, 1.677, 0], [.115, .087, .108], fabric);
    form([0, 1.64, female ? .017 : .101], [female ? .151 : .108, .014, female ? .147 : .122], trim);
  }
  return {
    root, face,
    dispose() {
      geometries.forEach(geometry => geometry.dispose());
      materials.forEach(material => material.dispose());
    },
  };
}
