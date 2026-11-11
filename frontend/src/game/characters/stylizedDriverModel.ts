import { clothingColors, type ClothingPiece } from "./clothingPieces";
import { usesFittedAnimation } from "./animationFit";
import { CapsuleGeometry, CylinderGeometry, Group, Mesh, MeshStandardMaterial, SphereGeometry, Vector3, type BufferGeometry } from "three";
import type { CharacterLook } from "./characterCatalog";

type Point = [number, number, number];

export function prepareStylizedDriver(look: CharacterLook) {
  const { female, fabric, trim, skin, hair, appearance, outfit } = look;
  const shoulders = female ? .155 : .205;
  const crop = appearance.hair === "cropped";
  const hat = appearance.headwear === "hat";
  const root = new Group();
  root.name = female ? "garage-mara-stylized" : "garage-jules-stylized";
  root.userData.fittedClothing = usesFittedAnimation(look);
  if (female) root.userData.skirtHandRoom = 0;
  const top: ClothingPiece = female ? "corset" : "coat";
  const sphere = new SphereGeometry(1, 16, 12);
  const geometries = new Set<BufferGeometry>([sphere]);
  const materials = new Map<string, MeshStandardMaterial>();
  const up = new Vector3(0, 1, 0);
  function mesh(geometry: BufferGeometry, color: string, piece?: ClothingPiece) {
    if (piece) color = clothingColors(look, piece)?.color ?? color;
    let material = materials.get(color);
    if (!material) {
      material = new MeshStandardMaterial({ color, roughness: .85 });
      materials.set(color, material);
    }
    geometries.add(geometry);
    const part = new Mesh(geometry, material);
    if (piece) part.userData.clothingPiece = piece;
    root.add(part);
    return part;
  }
  function form(at: Point, size: Point, color: string, rotation?: Point, piece?: ClothingPiece) {
    const part = mesh(sphere, color, piece);
    part.position.set(...at);
    part.scale.set(...size);
    if (rotation) part.rotation.set(...rotation);
    return part;
  }
  function limb(from: Point, to: Point, radius: number, color: string, piece?: ClothingPiece) {
    const start = new Vector3(...from);
    const direction = new Vector3(...to).sub(start);
    const height = Math.max(.01, direction.length() - radius * 1.2);
    const part = mesh(new CapsuleGeometry(radius, height, 4, 10), color, piece);
    part.position.copy(start.addScaledVector(direction, .5));
    part.quaternion.setFromUnitVectors(up, direction.normalize());
    return part;
  }
  function joint(name: string, at: Point, parent = root) {
    const pivot = new Group();
    pivot.name = name;
    pivot.position.set(...at);
    root.add(pivot);
    if (parent !== root) parent.attach(pivot);
    return pivot;
  }
  for (const side of [-1, 1]) {
    const suffix = side < 0 ? "r" : "l";
    const x = side * .115;
    const hip: Point = [x * .76, .90, 0];
    const knee: Point = [x + side * .017, .49, side * .025];
    const ankle: Point = [x + side * .04, .13, side * .065];
    const thigh = joint("thigh_" + suffix, hip);
    const calf = joint("calf_" + suffix, knee, thigh);
    const foot = joint("foot_" + suffix, ankle, calf);
    thigh.attach(limb(hip, knee, .082, "#222c38", "pants"));
    calf.attach(limb(knee, ankle, .064, "#273443", "pants"));
    foot.attach(form([ankle[0], .087, ankle[2] + .052], [.073, .08, .141], "#17212b", [0, side * .11, 0], "shoes"));
    foot.attach(form([ankle[0], .038, ankle[2] + .065], [.074, .033, .137], "#384450", undefined, "shoes"));
  }
  if (female) {
    const skirt = mesh(new CylinderGeometry(.14, .262, .54, 18), fabric, "skirt");
    skirt.position.y = .658;
    skirt.scale.z = .79;
  } else {
    form([0, .87, 0], [.185, .132, .112], "#222c38", undefined, "pants");
  }
  const torso = joint("spine_02", [0, .94, 0]);
  torso.attach(form([0, 1.14, 0], [shoulders + .018, .29, .122], fabric, undefined, top));
  torso.attach(form([0, 1.13, .114], [.032, .235, .013], female ? trim : "#17212b", undefined, top));
  torso.attach(form([0, .938, .006], [female ? .154 : .19, .044, .119], "#282635", undefined, "belt"));
  if (appearance.accent || (outfit.id !== "dockwear" && outfit.id !== "night-run")) {
    torso.attach(form([-.09, 1.28, .108], [.049, .026, .012], trim, undefined, "bow"));
  }
  for (const side of [-1, 1]) {
    const suffix = side < 0 ? "r" : "l";
    const shoulder: Point = [side * shoulders, 1.31, 0];
    const elbow: Point = [side * (shoulders + .064), 1.075, -.017];
    const hand: Point = [side * (shoulders + .045), .895, .04];
    const upper = joint("upperarm_" + suffix, shoulder, torso);
    const lower = joint("lowerarm_" + suffix, elbow, upper);
    const wrist = joint("hand_" + suffix, hand, lower);
    upper.attach(limb(shoulder, elbow, .067, fabric, female ? "sleeves" : "coat"));
    lower.attach(limb(elbow, hand, .056, fabric, female ? "sleeves" : "coat"));
    wrist.attach(form([hand[0], hand[1] - .018, hand[2]], [.046, .055, .043], skin));
  }
  torso.attach(form([0, 1.428, 0], [.062, .085, .059], skin));
  const head = joint("head", [0, 1.45, 0], torso);
  const headStart = root.children.length;
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
    form([0, 1.677, 0], [.115, .087, .108], fabric, undefined, "hat");
    form([0, 1.64, female ? .017 : .101], [female ? .151 : .108, .014, female ? .147 : .122], trim, undefined, "hat");
  }
  for (const part of root.children.slice(headStart)) head.attach(part);
  return {
    root, face,
    dispose() {
      geometries.forEach(geometry => geometry.dispose());
      materials.forEach(material => material.dispose());
    },
  };
}
