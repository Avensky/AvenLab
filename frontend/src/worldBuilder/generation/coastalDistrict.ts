import {coastalTerrain} from './coastalTerrain.ts';
import { addPiece, parseLayout, type LayoutObject, type V3, type WorldLayout } from "../document/layoutDocument.ts";

/** Expand land and run-up distances while preserving the narrow canal widths. */
export const coastalCoordinate = (value: number, halfCanal: number) =>
  Math.abs(value) <= halfCanal ? value : Math.sign(value) * (halfCanal + (Math.abs(value) - halfCanal) * (5 / 3));

/** A finite greybox, using the same explicit shapes as hand-authored pieces.
 * The wet channels reach the seabed. The server uses the same water footprints
 * for vehicle defeat, independently of the solid bank and deck colliders.
 */
export type DistrictSize = "block" | "chunk" | "massive";
export function coastalDistrict(mapId: string, seed = 1, surface = 0, districtSize: DistrictSize = "chunk", landBridge = true): WorldLayout {
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff)
    throw Error("Use a whole-number seed from 0 to 4294967295");
  if (!Number.isFinite(surface) || Math.abs(surface) > 10000)
    throw Error("Invalid coastal surface height");
  let randomState = seed >>> 0;
  const random = () => {
    randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0;
    return randomState / 4294967296;
  };
  const objects: LayoutObject[] = [];
  let serial = 0;
  const shape = (
    name: string, piece: string, position: V3, size: V3,
    color = "#7d8994", solid = true, wedge = false, yaw = 0,
  ) => {
    objects.push({
      id: `coast-${++serial}`, name, piece,
      position: [position[0], position[1] + surface, position[2]],
      size, yaw, color, solid, locked: false,
      parts: [{ shape: wedge ? "wedge" : "box", position: [0, 0.5, 0], size: [1, 1, 1] }],
    });
  };
  const slab = (name: string, x: number, z: number, width: number, depth: number, top = 0, thickness = 0.3, color = "#394a5a", piece = "coastal-road") =>
    shape(name, piece, [x, top - thickness, z], [width, thickness, depth], color);
  const water = (name: string, x: number, z: number, width: number, depth: number) => {
    const nx = Math.ceil(width / 200), nz = Math.ceil(depth / 200);
    for (let ix = 0; ix < nx; ix++) for (let iz = 0; iz < nz; iz++)
      shape(name, "coastal-water-visual", [x - width / 2 + (ix + 0.5) * width / nx, -5, z - depth / 2 + (iz + 0.5) * depth / nz], [width / nx, 0.04, depth / nz], "#266b85", false);
  };

  water("Harbor water · visual only", 230, 0, 180, 360);
  water("North–south canal · visual only", 0, 0, 40, 300);
  // Two separate branches avoid duplicate coplanar water surfaces at the junction.
  water("West canal · visual only", -100, 0, 160, 32);
  water("East canal to harbor · visual only", 80, 0, 120, 32);
  for (const [x, width] of [[-100, 160], [80, 120]]) {
    for (const z of [-83, 83]) {
      slab("Raised coastal district", x, z, width, 134, 0, 8, "#697b7b", "coastal-land");
    }
  }
  // Through roads reach the canal edges. Bridge decks alone fill the channels.
  for (const x of [-60, 60]) {
    for (const z of [-83, 83]) slab("Canal avenue", x, z, 14, 134, 0.08);
  }
  for (const z of [-80, 80]) {
    slab("West waterfront road", -100, z, 160, 14, 0.08);
    slab("East waterfront road", 80, z, 120, 14, 0.08);
    slab(z === 80 && landBridge ? "Permanent land bridge" : "Intact canal bridge", 0, z, 40, 14, 0.08,
      z === 80 && landBridge ? 8 : 0.6, "#a0a9ae", z === 80 && landBridge ? "coastal-land-bridge" : "coastal-bridge");
    for (const edge of [-7.2, 7.2])
      shape("Bridge parapet", "coastal-wall", [0, 0.08, z + edge], [40, 1, 0.4]);
  }
  // One safe crossing and one deliberate 12 m missing section. No invisible slab.
  slab("South canal crossing", 60, 0, 14, 32, 0.08, 0.6, "#a0a9ae", "coastal-bridge");
  for (const z of [-11, 11])
    slab("Damaged bridge approach", -60, z, 14, 10, 0.08, 0.6, "#9a9083", "coastal-broken-bridge");
  for (const x of [52.8, 67.2])
    shape("Crossing parapet", "coastal-wall", [x, 0.08, 0], [0.4, 1, 32]);
  // Warning blocks leave the center open for falls; these are static until the
  // authoritative breakable-object lifecycle is added to the server.
  for (const z of [-18, 18])
    for (const x of [-65.5, -54.5])
      shape("Damage warning · static", "coastal-warning", [x, 0.08, z], [2.5, 1.2, 0.6], "#d3a459");

  // Reserve avenues and bridge approaches before filling building lots.
  // Only building height/finish vary: random seeds cannot obstruct the routes.
  for (const x of [-145, -110, 100])
    for (const z of [-125, -40, 40, 125]) {
      const height = 8 + Math.floor(random() * 7) * 4;
      shape("Waterfront building", "coastal-building", [x, 0, z], [20, height, 22], random() < 0.5 ? "#778c9c" : "#8c9695");
    }
  // Open warehouse: separate wall and roof colliders preserve a usable interior.
  shape("Harbor warehouse", "coastal-warehouse", [105, 0, 45], [28, 10, 26]);
  const warehouse = objects.at(-1)!;
  warehouse.parts = [
    { shape: "box", position: [-0.48, 0.5, 0], size: [0.04, 1, 1] },
    { shape: "box", position: [0.48, 0.5, 0], size: [0.04, 1, 1] },
    { shape: "box", position: [0, 0.5, -0.48], size: [1, 1, 0.04] },
    { shape: "box", position: [0, 0.98, 0], size: [1, 0.04, 1] },
  ];
  // Remove the overlapping building lot to keep the warehouse interior open.
  const overlap = objects.findIndex(o => o.piece === "coastal-building" && o.position[0] === 100 && o.position[2] === 40);
  if (overlap >= 0) objects.splice(overlap, 1);
  shape("Rooftop ramp", "coastal-ramp", [-110, 0, 63], [10, 8, 24], "#b09a78", true, true);
  slab("Rooftop landing", -110, 40, 24, 22, 8, 0.5, "#9faaa6", "coastal-landing");
  // The ramp's low end is +Z; its high edge at z=51 meets this deck at y=8.
  // Keep the seeded building beneath the landing no taller than that surface.
  const landingBuilding = objects.find(o => o.piece === "coastal-building" && o.position[0] === -110 && o.position[2] === 40);
  if (landingBuilding) landingBuilding.size[1] = 7.5;

  slab("Harbor approach road", 100, 100, 80, 14, 0.08);
  slab("Harbor turn", 133, 109, 14, 32, 0.08);
  slab("Harbor pier", 170, 118, 60, 18, 0.08, 2, "#879397", "coastal-pier");
  // A first fleet-space prototype. Static decks test driving and collision;
  // it is intentionally not presented as a moving, buoyant vessel.
  slab("Carrier deck · static prototype", 245, 0, 42, 170, 2.08, 7, "#596e80", "fleet-static-deck");
  shape("Carrier access ramp", "coastal-ramp", [245, 0.08, 97], [14, 2, 24], "#85939d", true, true);
  slab("Carrier access pier", 226, 118, 52, 18, 0.08, 2, "#879397", "coastal-pier");
  shape("Carrier island", "fleet-static-building", [259, 2.08, 10], [10, 16, 24], "#82929e");
  for (const z of [-42, 0, 42])
    shape("Flight deck marking", "fleet-marking", [239, 2.08, z], [1, 0.025, 18], "#e2d8aa", false);
  for (const [x, z, width, depth] of [[184, -80, 16, 48], [294, -45, 18, 62], [294, 50, 18, 54]]) {
    slab("Escort deck · static prototype", x, z, width, depth, 1.2, 6, "#61798b", "fleet-static-deck");
    shape("Escort superstructure", "fleet-static-building", [x, 1.2, z], [width * 0.5, 7, depth * 0.3], "#8d9ca5");
  }
  // Designated staging pads are obstacle-free, with enough room for both teams.
  for (const [x, z, color] of [[-60, -115, "#55758c"], [60, 115, "#88636c"]] as const)
    slab("Team starting zone", x, z, 22, 30, 0.08, 0.3, color, "coastal-start");
  // A risky shortcut has a takeoff ramp, a real open center and a level landing.
  // It complements the intact crossings; the bridge is never mandatory.
  shape("Damaged crossing takeoff", "coastal-ramp", [-60, 0.08, 28], [12, 2, 28], "#b09a78", true, true);
  slab("Damaged crossing landing", -60, -22, 14, 16, 0.08, 0.5, "#9a9083", "coastal-landing");
  // Stretch footprints by their edges, so roads, bridge joints and ramp ends stay joined.
  for (const o of objects) {
    for (const [axis, bank] of [[0, 20], [2, 16]] as const) {
      const low = coastalCoordinate(o.position[axis] - o.size[axis] / 2, bank);
      const high = coastalCoordinate(o.position[axis] + o.size[axis] / 2, bank);
      o.position[axis] = (low + high) / 2;
      o.size[axis] = high - low;
    }
  }
  let district = parseLayout({
    format: "avenlab-world-layout", version: 1, map_id: mapId,
    title: `Coastal district · seed ${seed}`, base: "replace", ground: false, repeat: false,
    spawns: (["red", "blue"] as const).flatMap((team, index) =>
      [-4, 0, 4].map((offset, i) => ({
        id: `spawn-coast-${team}-${i + 1}`, team,
        position: [coastalCoordinate(index ? 60 : -60, 20), surface + 0.08, coastalCoordinate((index ? 115 : -115) + offset * 2, 16)] as V3,
        yaw: index ? 0 : 180,
      }))),
    objects,
  });
  // Reuse existing open-bay service prefabs rather than introducing a second
  // service implementation. Keep them beside, never across, the chase avenues.
  for (const [piece, x, z] of [["fuel-station", -85, -45], ["repair-shop", -85, 45], ["service-center", 90, 105]] as const)
    district = addPiece(district, piece, [coastalCoordinate(x, 20), surface + 0.08, coastalCoordinate(z, 16)]);
  const scale = { block: 0.5, chunk: 1, massive: 3 }[districtSize];
  if (!scale) throw Error("Choose a valid district size");
  const scaled: LayoutObject[] = [];
  for (const original of district.objects) {
    const o = structuredClone(original);
    for (const axis of [0, 2] as const) { o.position[axis] *= scale; o.size[axis] *= scale; }
    const nx = Math.ceil(o.size[0] / 500), nz = Math.ceil(o.size[2] / 500);
    if (nx * nz > 1 && !(o.parts.length === 1 && o.parts[0].shape === "box"))
      throw Error("Large compound piece needs subdivision");
    for (let ix = 0; ix < nx; ix++) for (let iz = 0; iz < nz; iz++) {
      const part = structuredClone(o);
      part.id = `${o.id}-tile-${ix}-${iz}`;
      part.position[0] += -o.size[0]/2 + (ix+0.5)*o.size[0]/nx;
      part.position[2] += -o.size[2]/2 + (iz+0.5)*o.size[2]/nz;
      part.size[0] /= nx; part.size[2] /= nz;
      scaled.push(part);
    }
  }
  coastalTerrain(scaled);
  return parseLayout({ ...district, title: `Coastal district · ${districtSize} · seed ${seed}`, objects: scaled,
    spawns: district.spawns?.map(p => ({ ...p, position: [p.position[0]*scale, p.position[1], p.position[2]*scale] })) });
}
