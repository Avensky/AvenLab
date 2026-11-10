import {
  BoxGeometry, CylinderGeometry, DodecahedronGeometry, Group, Mesh, MeshStandardMaterial, type BufferGeometry,
} from "three";
import type { Palm, XYZ } from "./garageEmotes";

export type EmoteProp = "map" | "binoculars" | "compass" | "collectible" | "controller";

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
  collectible: [null, { wrist: [-.043, -.071, -.044], palm: [[.28, .49, .82], [.94, -.25, -.17]] }],
  controller: [
    { wrist: [.107, -.037, -.064], palm: [[-.26, .32, .91], [-.86, .37, -.38]] },
    { wrist: [-.107, -.037, -.064], palm: [[.26, .32, .91], [.86, .37, -.38]] },
  ],
};

export type EmotePropModel = ReturnType<typeof createEmoteProp>;

export function createEmoteProp(kind: EmoteProp) {
  const root = new Group();
  root.name = "emote-prop-" + kind;
  root.visible = false;
  root.scale.setScalar(0);
  const panels: Group[] = [];
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
        }
      }
      break;
    }
    case "binoculars": {
      box(root, [.079, .023, .047], "#28373c", [0, .002, -.014]);
      for (const side of [-1, 1]) {
        disk(.031, .104, "#273134", [side * .043, 0, 0]).rotation.x = Math.PI / 2;
        disk(.035, .018, "#424b44", [side * .043, 0, .048]).rotation.x = Math.PI / 2;
        disk(.025, .004, "#579aab", [side * .043, 0, .058]).rotation.x = Math.PI / 2;
      }
      break;
    }
    case "compass":
      disk(.042, .019, "#946e3a", [0, 0, 0]);
      disk(.035, .003, "#e5d6aa", [0, .011, 0]);
      box(root, [.007, .003, .048], "#ab4f35", [0, .014, 0]).rotation.y = -.44;
      break;
    case "collectible": {
      const stone = mesh(root, new DodecahedronGeometry(.029, 0), "#68a98b", [0, 0, 0]);
      stone.scale.set(.85, 1.34, .81);
      stone.rotation.z = .25;
      break;
    }
    case "controller":
      box(root, [.19, .038, .091], "#30394a", [0, 0, 0]);
      for (const side of [-1, 1]) {
        box(root, [.052, .036, .09], "#252e39", [side * .073, -.012, -.026]).rotation.y = -side * .23;
        disk(.014, .01, "#818fa6", [side * .041, .025, -.008]);
      }
      box(root, [.033, .004, .008], "#81b5c4", [0, .021, .018]);
      for (const [x, z] of [[-.065, .018], [-.079, .029], [-.051, .029], [-.065, .04]]) {
        disk(.006, .005, "#da6582", [x, .021, z]);
      }
      break;
  }
  return {
    root, panels,
    dispose() {
      root.removeFromParent();
      geometries.forEach(geometry => geometry.dispose());
      materials.forEach(material => material.dispose());
    },
  };
}
