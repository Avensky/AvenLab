import {
  CatmullRomCurve3, DoubleSide, Group, Mesh, MeshStandardMaterial, Object3D, Shape, ShapeGeometry, TubeGeometry, Vector2, Vector3,
  type BufferGeometry,
} from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { VILLAGER_EYES } from "./villagerFace";

import type { PieceColors } from "./clothingPieces";

type EyeFit = typeof VILLAGER_EYES.female;
type Glasses = "round" | "aviator";

function tubes(curves: { points: Vector3[]; closed?: boolean }[], radius: number, segments: number) {
  const parts = curves.map(({ points, closed }) => new TubeGeometry(new CatmullRomCurve3(points, closed), segments, radius, 6, closed));
  const merged = mergeGeometries(parts);
  parts.forEach(part => part.dispose());
  return merged;
}

function frames(fit: EyeFit, style: Glasses) {
  const aviator = style === "aviator";
  const z = fit.z + .039;
  const y = fit.y + .002;
  const curves: { points: Vector3[]; closed?: boolean }[] = [];
  const lenses: BufferGeometry[] = [];
  for (const side of [-1, 1]) {
    const rim = Array.from({ length: 24 }, (_, i) => {
      const angle = i * Math.PI / 12;
      const height = Math.sin(angle);
      const width = aviator ? .021 * (.91 + .24 * height) : .021;
      return new Vector3(side * (fit.x + .001 + width * Math.cos(angle)), y + height * (aviator ? .019 : .017), z);
    });
    curves.push({ points: rim, closed: true });
    const shape = new Shape(rim.map(({ x, y }) => new Vector2(x, y)));
    lenses.push(new ShapeGeometry(shape).translate(0, 0, z - .0003));
    curves.push({ points: [new Vector3(side * (fit.x + .021), y + .002, z),
      new Vector3(side * .061, y + .005, z - .013), new Vector3(side * .066, y + .004, z - .088),
      new Vector3(side * .067, y - .003, z - .101)] });
  }
  const bridge = fit.x - .018;
  curves.push({ points: [new Vector3(-bridge, y + .006, z), new Vector3(0, y + .011, z + .001), new Vector3(bridge, y + .006, z)] });
  if (aviator) curves.push({ points: [new Vector3(-.015, y + .015, z), new Vector3(0, y + .017, z), new Vector3(.015, y + .015, z)] });

  const group = new Group();
  group.name = "villager-glasses";
  group.userData.clothingPiece = "glasses";
  const rims = new Mesh(tubes(curves, aviator ? .00135 : .0017, 36),
    new MeshStandardMaterial({ color: aviator ? 0xba8845 : 0x282a31, roughness: .37, metalness: aviator ? .72 : .2 }));
  const glass = new Mesh(mergeGeometries(lenses), new MeshStandardMaterial({
    color: 0xbad4e3, roughness: .16, transparent: true, opacity: .048, depthWrite: false, side: DoubleSide,
  }));
  lenses.forEach(lens => lens.dispose());
  group.add(rims, glass);
  return { group, setColors(colors?: PieceColors) {
    rims.material.color.set(colors?.color ?? (aviator ? 0xba8845 : 0x282a31));
    glass.material.color.set(colors?.accent ?? 0xbad4e3);
  }, dispose() {
    group.removeFromParent();
    rims.geometry.dispose();
    rims.material.dispose();
    glass.geometry.dispose();
    glass.material.dispose();
  } };
}

function tearline(fit: EyeFit) {
  const arcs = [-1, 1].map(side => ({ points: [
    new Vector3(side * (fit.x - .008), fit.y - .004, fit.z + .0008),
    new Vector3(side * (fit.x - .003), fit.y - .0062, fit.z + .0022),
    new Vector3(side * (fit.x + .002), fit.y - .0066, fit.z + .0020),
    new Vector3(side * (fit.x + .007), fit.y - .0052, fit.z + .0006),
  ] }));
  const tears = new Mesh(tubes(arcs, .0009, 12), new MeshStandardMaterial({
    color: 0xcfeeff, roughness: .14, emissive: 0x6c9cb8, emissiveIntensity: .55, transparent: true, opacity: 0, depthWrite: false,
  }));
  tears.name = "villager-tearline";
  return tears;
}

export function prepareVillagerFaceAccessories(root: Object3D, female: boolean, wetEyes: boolean) {
  const fit = VILLAGER_EYES[female ? "female" : "male"];
  const head = root.getObjectByName("head");
  // Attach an origin in bind coordinates so late changes follow a posed head.
  const faceOrigin = new Group();
  head?.attach(faceOrigin);
  let glasses: ReturnType<typeof frames> | undefined;
  let style: string | undefined;
  const focus = new Object3D();
  focus.name = "villager-face-focus";
  focus.position.set(0, fit.y - .022, fit.z);
  faceOrigin.add(focus);
  const tears = wetEyes && head ? tearline(fit) : null;
  if (tears) faceOrigin.add(tears);
  return {
    setGlasses(next: string | undefined) {
      if (!head || style === next) return;
      style = next;
      glasses?.dispose();
      glasses = next === "round" || next === "aviator" ? frames(fit, next) : undefined;
      if (glasses) faceOrigin.add(glasses.group);
    },
    setColors(colors?: PieceColors) { glasses?.setColors(colors); },
    dispose() {
      glasses?.dispose();
      tears?.geometry.dispose();
      tears?.material.dispose();
    },
  };
}
