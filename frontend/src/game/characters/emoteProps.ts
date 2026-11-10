import {
  BoxGeometry, Color, CylinderGeometry, DodecahedronGeometry, DoubleSide, Float32BufferAttribute, Group,
  Mesh, MeshStandardMaterial, Object3D, PlaneGeometry, type BufferGeometry,
} from "three";
import type { Palm, XYZ } from "./garageEmotes";

export type EmoteProp = "map" | "binoculars" | "compass" | "collectible" | "controller" | "headphones" | "phone" | "tablet" | "keyboard" | "gauge" | "cloth" | "flag";

type Grip = { wrist: XYZ; palm: Palm };
export const EMOTE_PROP_GRIPS: Record<EmoteProp, readonly [Grip | null, Grip | null]> = {
  map: [
    { wrist: [.151, -.036, -.026], palm: [[-.48, .23, .85], [-.87, -.12, -.47]] },
    { wrist: [-.151, -.036, -.026], palm: [[.48, .23, .85], [.87, -.12, -.47]] },
  ],
  binoculars: [
    { wrist: [.104, -.048, .004], palm: [[-.17, .74, .65], [-.95, -.13, -.08]] },
    { wrist: [-.104, -.048, .004], palm: [[.17, .74, .65], [.95, -.13, -.08]] },
  ],
  compass: [null, { wrist: [-.014, -.025, -.082], palm: [[.11, .07, 1], [0, 1, -.07]] }],
  collectible: [null, { wrist: [-.026, -.031, -.075], palm: [[.09, .17, .982], [.12, .98, -.18]] }],
  controller: [
    { wrist: [.107, -.037, -.064], palm: [[-.26, .32, .91], [-.86, .37, -.38]] },
    { wrist: [-.107, -.037, -.064], palm: [[.26, .32, .91], [.86, .37, -.38]] },
  ],
  headphones: [
    { wrist: [.148, -.052, -.034], palm: [[-.12, .78, .61], [-1, 0, 0]] },
    { wrist: [-.148, -.052, -.034], palm: [[.12, .78, .61], [1, 0, 0]] },
  ],
  phone: [{ wrist: [.042, -.062, -.026], palm: [[-.25, .72, .65], [-.82, -.51, .23]] }, null],
  tablet: [{ wrist: [.114, -.055, -.036], palm: [[-.46, .49, .74], [-.88, -.29, -.36]] }, null],
  keyboard: [{ wrist: [.122, -.033, -.041], palm: [[-.37, .44, .82], [-.87, .45, -.16]] }, null],
  gauge: [null, { wrist: [-.016, -.034, -.078], palm: [[-.045, .24, .97], [0, .97, -.24]] }],
  cloth: [null, { wrist: [-.004, -.026, -.052], palm: [[.08, .19, .98], [.11, -.98, .18]] }],
  flag: [null, { wrist: [-.013, -.037, -.064], palm: [[.16, .25, .955], [.13, .96, -.28]] }],
};

export type EmotePropModel = ReturnType<typeof createEmoteProp>;

export function createEmoteProp(kind: EmoteProp) {
  const root = new Group();
  root.name = "emote-prop-" + kind;
  root.visible = false;
  root.scale.setScalar(0);
  const panels: Group[] = [];
  let flagCloth: Mesh | undefined;
  let flagGrip: Object3D | undefined;
  const materials = new Map<string, MeshStandardMaterial>();
  const geometries: BufferGeometry[] = [];
  function mesh(parent: Group, geometry: BufferGeometry, color: string, at: XYZ) {
    let material = materials.get(color);
    if (!material) {
      material = new MeshStandardMaterial({ color, roughness: .74 });
      materials.set(color, material);
    }
    const part = new Mesh(geometry, material);
    part.position.set(...at);
    parent.add(part);
    geometries.push(geometry);
    return part;
  }
  const box = (parent: Group, size: XYZ, color: string, at: XYZ) =>
    mesh(parent, new BoxGeometry(...size), color, at);
  const disk = (radius: number, depth: number, color: string, at: XYZ) =>
    mesh(root, new CylinderGeometry(radius, radius, depth, 12), color, at);
  switch (kind) {
    case "map": {
      for (const side of [1, -1]) {
        const panel = new Group();
        panels.push(panel);
        root.add(panel);
        const center = side * .072;
        box(panel, [.143, .181, .004], "#d4c8a0", [center, 0, 0]);
        for (const face of [-1, 1]) {
          box(panel, [.111, .025, .001], "#8da89a", [center, -.048, face * .0025]).rotation.z = side * .28;
          box(panel, [.109, .006, .001], "#7b6c55", [center, .013, face * .0025]).rotation.z = -side * .42;
          box(panel, [.048, .005, .001], "#b35637", [center + side * .022, .041, face * .003]).rotation.z = side * .9;
          if (side === 1) {
            box(panel, [.005, .032, .001], "#883627", [center + .018, .05, face * .0035]);
            box(panel, [.005, .017, .001], "#883627", [center + .013, .06, face * .0035]).rotation.z = -.63;
            box(panel, [.005, .017, .001], "#883627", [center + .023, .06, face * .0035]).rotation.z = .63;
          }
        }
      }
      break;
    }
    case "binoculars": {
      box(root, [.079, .023, .047], "#28373c", [0, .002, -.014]);
      for (const side of [-1, 1]) {
        disk(.031, .168, "#273134", [side * .043, 0, .032]).rotation.x = Math.PI / 2;
        disk(.035, .032, "#424b44", [side * .043, 0, .116]).rotation.x = Math.PI / 2;
        disk(.025, .004, "#579aab", [side * .043, 0, .133]).rotation.x = Math.PI / 2;
      }
      break;
    }
    case "compass":
      disk(.042, .019, "#946e3a", [0, 0, 0]);
      disk(.035, .003, "#e5d6aa", [0, .011, 0]);
      box(root, [.007, .003, .048], "#ab4f35", [0, .014, 0]).rotation.y = -.44;
      break;
    case "collectible": {
      const stone = mesh(root, new DodecahedronGeometry(.039, 0), "#60af8d", [0, .013, 0]);
      stone.scale.set(1, .84, .93);
      stone.rotation.z = .25;
      break;
    }
    case "controller":
      box(root, [.19, .05, .091], "#30394a", [0, -.006, 0]);
      for (const side of [-1, 1]) {
        box(root, [.052, .036, .09], "#252e39", [side * .073, -.012, -.026]).rotation.y = -side * .23;
        disk(.014, .01, "#818fa6", [side * .041, .025, -.008]);
      }
      box(root, [.033, .004, .008], "#81b5c4", [0, .021, .018]);
      for (const [x, z] of [[-.065, .018], [-.079, .029], [-.051, .029], [-.065, .04]]) {
        disk(.006, .005, "#da6582", [x, .021, z]);
      }
      break;
    case "headphones": {
      box(root, [.186, .022, .047], "#454758", [0, .145, 0]);
      for (const side of [-1, 1]) {
        box(root, [.024, .072, .042], "#454758", [side * .105, .125, 0]).rotation.z = side * .6;
        box(root, [.025, .115, .035], "#363a49", [side * .124, .061, 0]).rotation.z = side * .07;
        disk(.047, .044, "#4b5165", [side * .126, -.003, .003]).rotation.z = Math.PI / 2;
        disk(.037, .02, "#262630", [side * .099, -.003, .003]).rotation.z = Math.PI / 2;
      }
      break;
    }
    case "phone":
    case "tablet": {
      const tablet = kind === "tablet";
      const width = tablet ? .218 : .073, height = tablet ? .154 : .131;
      const depth = tablet ? .025 : .023;
      box(root, [width, height, depth], "#252e3d", [0, 0, 0]);
      box(root, [width - .014, height - .02, .002], "#395c74", [0, 0, -depth / 2 - .001]);
      box(root, [width - .02, height - .024, .003], "#485365", [0, 0, depth / 2]);
      box(root, [.02, .013, .004], "#131921", [.014, .044, depth / 2 + .003]);
      break;
    }
    case "keyboard":
      box(root, [.227, .024, .084], "#3b465a", [0, -.004, 0]);
      for (const z of [-.026, -.008, .01, .028]) {
        box(root, [.125, .004, .012], "#9ca9bc", [-.034, .01, z]);
        box(root, [.058, .004, .012], "#9ca9bc", [.074, .01, z]);
      }
      break;
    case "gauge":
      disk(.038, .024, "#434f57", [0, 0, 0]);
      disk(.032, .003, "#d0dce0", [0, .013, 0]);
      box(root, [.004, .003, .045], "#ce6346", [0, .015, 0]).rotation.y = .58;
      box(root, [.021, .023, .053], "#434f57", [0, 0, .05]);
      break;
    case "cloth":
      box(root, [.128, .008, .107], "#80a5a6", [0, 0, 0]).rotation.y = -.24;
      box(root, [.095, .008, .071], "#abc5bb", [.009, .006, .005]).rotation.y = .19;
      break;
    case "flag": {
      flagGrip = new Object3D();
      root.add(flagGrip);
      mesh(root, new CylinderGeometry(.008, .01, .77, 8), "#607988", [0, .14, 0]);
      disk(.016, .026, "#d2b475", [0, .532, 0]);
      const panel = new Group();
      panel.position.y = .346;
      root.add(panel);
      panels.push(panel);
      const grid = new PlaneGeometry(.46, .29, 8, 6);
      const cloth = grid.toNonIndexed();
      grid.dispose();
      const position = cloth.getAttribute("position");
      const uv = cloth.getAttribute("uv");
      const colors: number[] = [];
      const wave = new Float32Array(position.count * 3);
      const light = new Color("#f0e9d1"), dark = new Color("#202832");
      for (let i = 0; i < position.count; i += 3) {
        const u = (uv.getX(i) + uv.getX(i + 1) + uv.getX(i + 2)) / 3;
        const v = (uv.getY(i) + uv.getY(i + 1) + uv.getY(i + 2)) / 3;
        const color = (Math.floor(u * 8) + Math.floor(v * 6)) % 2 ? dark : light;
        for (let j = i; j < i + 3; j++) {
          const span = uv.getX(j);
          colors.push(color.r, color.g, color.b);
          wave[j * 3 + 2] = span * .07 * Math.sin(span * 8.6 + uv.getY(j) * 1.25);
        }
      }
      cloth.setAttribute("color", new Float32BufferAttribute(colors, 3));
      cloth.morphTargetsRelative = true;
      cloth.morphAttributes.position = [new Float32BufferAttribute(wave, 3)];
      const clothMaterial = new MeshStandardMaterial({ vertexColors: true, side: DoubleSide, roughness: .89 });
      flagCloth = new Mesh(cloth, clothMaterial);
      flagCloth.position.x = .23;
      panel.add(flagCloth);
      geometries.push(cloth);
      materials.set("flag-cloth", clothMaterial);
      break;
    }
  }
  return {
    root, panels, flagCloth, flagGrip,
    dispose() {
      root.removeFromParent();
      geometries.forEach(geometry => geometry.dispose());
      materials.forEach(material => material.dispose());
    },
  };
}
