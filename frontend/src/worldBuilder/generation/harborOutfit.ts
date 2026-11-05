import {DOCK_DEPTH} from './coastalTerrain.ts';
import {
  pieceById,
  type LayoutObject,
  type V3,
} from "../document/layoutDocument.ts";
import { guardrail } from "./harborPieces.ts";

// The marker is at the foot of the pier. The service bay opens toward the
// crossing, with its own slab so a wheel never finds open water at the door.
export function dockHome(side: number, shoreX: number, y: number, z: number, setback = 24): LayoutObject[] {
  const bank = side < 0 ? "west" : "east";
  const team = side < 0 ? "red" : "blue";
  const bayX = shoreX - side * setback;
  const common = { yaw: 0, locked: false, solid: true };
  const boxParts = () => [{ shape: "box" as const, position: [0, .5, 0] as V3, size: [1, 1, 1] as V3 }];
  return [
    { ...common, id: "home-apron-" + bank, piece: "coastal-pier", name: "Dock garage apron",
      position: [bayX, y - 0.12, z - 15], size: [26, 0.12, 30], color: "#68757c", parts: boxParts() },
    { ...common, id: "home-gas-" + bank, piece: "service-center", name: "Dock home garage",
      position: [bayX, y, z - 19], size: [18, 6, 20], color: "#8ca480",
      model: structuredClone(pieceById("service-center")!.model!), parts: [] },
    { ...common, id: "home-flag-" + team, piece: "ctf-home", name: "Dock flag stand",
      position: [shoreX - side * 7, y + .02, z], size: [8, .025, 8], color: "#59616b", solid: false, parts: boxParts() },
  ];
}

// Add these after the original objects so their damage and spawn IDs remain stable.
export function outfitHarbor(objects: LayoutObject[]) {
  const additions: LayoutObject[] = [];
  function box(
    id: string,
    piece: string,
    name: string,
    position: V3,
    size: V3,
    color: string,
  ) {
    const o: LayoutObject = {
      id,
      piece,
      name,
      position,
      size,
      color,
      solid: true,
      locked: false,
      yaw: 0,
      parts: [{ shape: "box", position: [0, 0.5, 0], size: [1, 1, 1] }],
    };
    additions.push(o);
    return o;
  }
  const seabed = -8-DOCK_DEPTH;
  for (const side of [-1, 1]) {
    const bank = side < 0 ? "west" : "east";
    for (const z of [-236, -94, 94, 236]) {
      box(
        `street-${bank}-${z + 300}`,
        "coastal-road",
        "Dockside cross street",
        [side * 101, 0.005, z],
        [94, 0.075, 8],
        "#363e43",
      );
    }
    const dock = objects.find(
      (o) => o.piece === "big-e-docked" && Math.sign(o.position[0]) === side,
    );
    if (!dock) {
      const station = box("home-gas-" + bank, "fuel-station", "Home gas and repair garage",
        [side * 64, .08, 159], [14, 5, 16], "#ad9566");
      station.model = structuredClone(pieceById("fuel-station")!.model!);
      station.parts = [];
      station.yaw = 180;
      continue;
    }
    const ramp = objects.find(
      (o) => o.piece === "coastal-ramp" && Math.sign(o.position[0]) === side,
    )!;
    const pier = objects.find(
      (o) => o.piece === "coastal-pier" && Math.sign(o.position[0]) === side,
    )!;
    const run = ramp.size[2],
      rise = ramp.size[1],
      half = ramp.size[0] / 2;
    const shore = Math.abs(ramp.position[0]) - run / 2;
    additions.push(...dockHome(side, side * shore, ramp.position[1], ramp.position[2]));
    // The original wedge owns the grade. Caps sit below it and pairs of solid
    // columns reach the ocean floor, leaving open water between the supports.
    [run * 0.25, run * 0.72, run + 7, run + 19].forEach((distance, i) => {
      const y = ramp.position[1] + rise * Math.min(1, distance / run);
      for (const post of [-1, 1]) {
        box(
          `col-${bank}-${i}-${post}`,
          "harbor-column",
          "Boarding bridge column",
          [side * (shore + distance), seabed, post * (half - 1.8)],
          [1.3, y - seabed - 1.15, 1.4],
          "#7d8587",
        );
      }
      box(
        `cap-${bank}-${i}`,
        "harbor-column",
        "Boarding bridge crossbeam",
        [side * (shore + distance), y - 1.25, 0],
        [1.5, 0.6, half * 2],
        "#687679",
      );
    });
    for (const edge of [-1, 1]) {
      const z = edge * (half - 0.18);
      for (let i = 0; i < 6; i++) {
        const a = (run * i) / 6,
          b = (run * (i + 1)) / 6;
        additions.push(
          guardrail(
            `boarding-rail-${bank}-${edge}-r${i}`,
            side * (shore + a),
            z,
            side * (shore + b),
            z,
            ramp.position[1] + (rise * (a + b)) / (2 * run),
            rise * (b - a) / run,
          ),
        );
      }
      const x1 = shore + run,
        x2 = Math.abs(pier.position[0]) + pier.size[0] / 2;
      for (let i = 0; i < 3; i++) {
        additions.push(
          guardrail(
            `boarding-rail-${bank}-${edge}-p${i}`,
            side * (x1 + ((x2 - x1) * i) / 3),
            z,
            side * (x1 + ((x2 - x1) * (i + 1)) / 3),
            z,
            dock.position[1],
          ),
        );
      }
    }
  }
  objects.push(...additions);
}
