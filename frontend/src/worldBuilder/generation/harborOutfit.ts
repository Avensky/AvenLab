import {
  pieceById,
  type LayoutObject,
  type V3,
} from "../document/layoutDocument.ts";
import { guardrail } from "./harborPieces.ts";

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
  const seabed = -24;
  for (const water of objects.filter(
    (o) => o.piece === "coastal-water-visual",
  )) {
    box(
      "bed-" + water.id,
      "harbor-seabed",
      "Harbor seabed",
      [water.position[0], seabed - 1, water.position[2]],
      [water.size[0], 1, water.size[2]],
      "#5a5851",
    );
  }
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
    const station = box(
      "home-gas-" + bank,
      "fuel-station",
      "Home gas and repair garage",
      [side * (dock ? 173 : 64), 0.08, dock ? 16 : 159],
      [14, 5, 16],
      "#ad9566",
    );
    station.parts = structuredClone(pieceById("fuel-station")!.parts);
    station.yaw = dock ? -90 * side : 180;
    if (!dock) continue;
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
