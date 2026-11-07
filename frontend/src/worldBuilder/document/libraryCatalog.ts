import {modelAsset,newModel} from "../models/modelCatalog.ts";
export const glassDamage = {enabled:true, hp:3, smallArms:1, cannon:1, bomb:1, rubble:'clear' as const};
export const isServiceGarage = (id: string) => ["fuel-station","repair-shop","service-center"].includes(id);
import type { LayoutPart, Piece } from "./layoutDocument.ts";

export const LIBRARY_TABS = [
  { id: "all", label: "All" },
  { id: "chunks2", label: "2×2 chunks" },
  { id: "chunks3", label: "3×3 chunks" },
  { id: "blocks", label: "Blocks" },
  { id: "buildings", label: "Buildings" },
  { id: "garages", label: "Garages / small" },
  { id: "roads", label: "Roads" },
  { id: "jumps", label: "Jumps" },
  { id: "objectives", label: "Objectives" },
  { id: "vehicles", label: "Vehicles" },
  { id: "boats", label: "Boats" },
  { id: "props", label: "Props" },
] as const;
export type LibraryTab = (typeof LIBRARY_TABS)[number]["id"];
export function inLibraryTab(piece: Piece, tab: LibraryTab) {
  if (tab === "all") return true;
  if (tab === "garages")
    return (
      Boolean(piece.model && piece.category === "structures") ||
      piece.id === "garage" ||
      piece.category === "garages"
    );
  if (tab === "buildings")
    return piece.id === "building" || piece.category === "buildings";
  if (tab === "jumps") return piece.id === "ramp" || piece.category === "jumps";
  if (tab === "blocks")
    return ["wall", "floor"].includes(piece.id) || piece.category === "blocks";
  return piece.category === tab;
}
const box = (
  position: [number, number, number],
  size: [number, number, number],
  color?: string,
  solid = true,
): LayoutPart => ({
  shape: "box",
  position,
  size,
  ...(color ? { color } : {}),
  ...(solid ? {} : { solid: false }),
});
function chunk(side: 2 | 3): Piece {
  const parts: LayoutPart[] = [],
    width = side * 80;
  // A repeatable starter block has a courtyard and two solid building masses.
  // Shared road strips stay separate from those buildings. No GLB is cut.
  for (let x = 0; x < side; x++)
    for (let z = 0; z < side; z++) {
      const cx = ((x + 0.5) * 80 - width / 2) / width,
        cz = ((z + 0.5) * 80 - width / 2) / width;
      parts.push(
        box([cx, 0.005, cz], [64 / width, 0.01, 64 / width], "#718695"),
      );
      parts.push(
        box(
          [cx - 17 / width, 0.455, cz - 10 / width],
          [18 / width, 0.9, 36 / width],
          "#647f97",
        ),
      );
      parts.push(
        box(
          [cx + 17 / width, 0.305, cz + 10 / width],
          [18 / width, 0.6, 36 / width],
          "#849aab",
        ),
      );
    }
  for (let i = 1; i < side; i++) {
    const p = i / side - 0.5;
    parts.push(box([p, -0.005, 0], [16 / width, 0.01, 1], "#34465a"));
    parts.push(box([0, -0.005, p], [1, 0.01, 16 / width], "#34465a"));
  }
  return {
    id: `chunk-${side}x${side}`,
    label: `${side}×${side} starter chunk`,
    category: side === 2 ? "chunks2" : "chunks3",
    description: `${side * side} modular blocks · ${width} m · courtyards and explicit roads`,
    size: [width, 20, width],
    color: "#6a8cac",
    parts,
  };
}
function mountainFabrication(carvedCurve90 = false): LayoutPart[] {
  const extent = 72, height = 36, cell = 12, parts: LayoutPart[] = [];
  const tunnelCenter = (x: number, z: number) => {
    const angle = Math.max(-Math.PI / 2, Math.min(0, Math.atan2(z - 48, x)));
    const nearestX = 48 * Math.cos(angle), nearestZ = 48 + 48 * Math.sin(angle);
    return Math.hypot(x - nearestX, z - nearestZ);
  };
  for (let y = cell / 2; y < height; y += cell) {
    const layer = Math.floor(y / cell), hillRadius = 48 - layer * 12;
    for (let xi = 0; xi < extent / cell; xi++) {
      const x = cell / 2 + xi * cell;
      let runStart = -1;
      const flush = (end: number) => {
        if (runStart < 0) return;
        const runLength = (end - runStart) * cell;
        const runCenter = (runStart + end) * cell / 2 - extent / 2;
        const shade = layer === 0 ? "#6f7779" : layer === 1 ? "#7c8586" : "#8b9290";
        parts.push(box(
          [(x - extent / 2) / extent, y / height, runCenter / extent],
          [cell / extent, cell / height, runLength / extent], shade,
        ));
        runStart = -1;
      };
      for (let zi = 0; zi <= extent / cell; zi++) {
        const z = cell / 2 + zi * cell;
        const rock = zi < extent / cell && Math.hypot(x - 24, z - 24) <= hillRadius &&
          // The 90° road bore is a subtraction from the rock cells. Leave a
          // 12 m high opening around the measured H27 highway bend centerline.
          !(carvedCurve90 && y < 12 && tunnelCenter(x, z) < 18);
        if (rock && runStart < 0) runStart = zi;
        else if (!rock) flush(zi);
      }
    }
  }
  return parts;
}
function mountainSegmentParts(width: number, height: number): LayoutPart[] {
  const cell = 12, parts: LayoutPart[] = [];
  for (let y = cell / 2; y < height; y += cell) {
    for (let x = cell / 2; x < width; x += cell) {
      const across = Math.abs((x - width / 2) / (width / 2));
      const ridgeHeight = height * (1 - across);
      if (y >= ridgeHeight) continue;
      const shade = y < height / 3 ? "#6f7779" : y < height * 2 / 3 ? "#7c8586" : "#8b9290";
      // Each 12 m cell along a mountain run used to become a separate part.
      // These adjacent cells are identical, so one full-length box has the
      // same surface and collision volume with fewer scene objects/shapes.
      parts.push(box(
        [(x - width / 2) / width, y / height, 0],
        [cell / width, cell / height, 1], shade,
      ));
    }
  }
  return parts;
}
function mountainCanalParts(): LayoutPart[] {
  const extent = 72, height = 36, cell = 12, parts: LayoutPart[] = [];
  for (let y = cell / 2; y < height; y += cell) {
    const layer = Math.floor(y / cell), hillRadius = 48 - layer * 12;
    for (let xi = 0; xi < extent / cell; xi++) {
      const x = cell / 2 + xi * cell;
      let runStart = -1;
      const flush = (end: number) => {
        if (runStart < 0) return;
        const runLength = (end - runStart) * cell;
        const runCenter = (runStart + end) * cell / 2 - extent / 2;
        const shade = layer === 0 ? "#6f7779" : layer === 1 ? "#7c8586" : "#8b9290";
        parts.push(box(
          [(x - extent / 2) / extent, y / height, runCenter / extent],
          [cell / extent, cell / height, runLength / extent], shade,
        ));
        runStart = -1;
      };
      for (let zi = 0; zi <= extent / cell; zi++) {
        const z = cell / 2 + zi * cell;
        // Carve a straight 24 m waterway from bank to bank through the lower
        // 12 m of the rock cells. The seabed/water remain separate parts.
        const rock = zi < extent / cell && Math.hypot(x - 36, z - 36) <= hillRadius &&
          !(y < 12 && Math.abs(x - extent / 2) < 18);
        if (rock && runStart < 0) runStart = zi;
        else if (!rock) flush(zi);
      }
    }
  }
  parts.push(box([0,.045,0],[.34,.09,1],"#515354"));
  parts.push(box([0,.17,0],[.33,.015,1],"#28748b",false));
  return parts;
}
const outline = (color: string): LayoutPart[] => [
  box([-0.49, 0.5, 0], [0.02, 1, 1], color, false),
  box([0.49, 0.5, 0], [0.02, 1, 1], color, false),
  box([0, 0.5, -0.49], [1, 1, 0.02], color, false),
  box([0, 0.5, 0.49], [1, 1, 0.02], color, false),
];
const arrow: LayoutPart[] = [
  box([0, 0.5, 0.18], [0.18, 1, 0.6], undefined, false),
  box([0, 0.5, -0.12], [0.85, 1, 0.16], undefined, false),
  box([0, 0.5, -0.26], [0.52, 1, 0.15], undefined, false),
  box([0, 0.5, -0.4], [0.2, 1, 0.14], undefined, false),
];
export const EXTRA_PIECES: Piece[] = [
  ...(['fuel-station', 'repair-shop', 'service-center'] as const).map((id): Piece => ({
    id, label: id === 'fuel-station' ? 'Fuel station' : id === 'repair-shop' ? 'Repair shop' : 'Service center',
    category: 'garages',
    description: 'Two-wall garage with open entries. Stop inside for service.',
    size: [18, 7, 20], color: id === 'fuel-station' ? '#c4a46a' : id === 'repair-shop' ? '#6ba5b0' : '#8ca480',
    model: newModel(modelAsset("selection_garage")!), parts: [],
  })),
  {
    id:"bridge-span",label:"Bridge span",category:"jumps",description:"Modular concrete bridge · deck 5 m above its base",size:[12,5.6,30],color:"#8297ac",
    parts:[box([0,.93,0],[1,.1,1]),box([-.47,1.04,0],[.05,.15,1]),box([.47,1.04,0],[.05,.15,1]),box([0,.44,-.38],[.6,.88,.08]),box([0,.44,.38],[.6,.88,.08])],
  },
  {
    id:"canal-section",label:"Canal section",category:"props",description:"Raised concrete channel with a visual water strip · no terrain excavation or water physics",size:[16,2,30],color:"#8398a9",
    parts:[box([-.44,.5,0],[.12,1,1]),box([.44,.5,0],[.12,1,1]),box([0,.04,0],[.8,.08,1]),box([0,.28,0],[.75,.02,1],"#28657b",false)],
  },
  {
    id:"excavated-canal-section",label:"Excavated canal profile",category:"roads",
    description:"40 m open channel · solid seabed and retaining walls with a separate non-solid water surface. Water simulation remains map-level.",
    size:[64,12,32],color:"#657d86",
    parts:[
      box([0,.055,0],[.64,.09,1],"#515354"),
      box([-.33,.39,0],[.04,.66,1],"#7c8588"),
      box([.33,.39,0],[.04,.66,1],"#7c8588"),
      box([0,.43,0],[.62,.012,1],"#28657b",false),
    ],
  },
  {
    id:"mountain-segment-small",label:"Mountain segment · Small · 24 m",category:"blocks",
    description:"24 m default segment · 48 m wide × 24 m high · solid low-poly rock cells. Add matching segments end-to-end.",
    size:[48,24,24],color:"#7c8586",parts:mountainSegmentParts(48,24),
  },
  {
    id:"mountain-segment-standard",label:"Mountain segment · Standard · 24 m",category:"blocks",
    description:"24 m default segment · 72 m wide × 36 m high · solid low-poly rock cells. Add matching segments end-to-end.",
    size:[72,36,24],color:"#7c8586",parts:mountainSegmentParts(72,36),
  },
  {
    id:"mountain-segment-long",label:"Mountain segment · Long · 48 m",category:"blocks",
    description:"48 m segment · 72 m wide × 36 m high · solid low-poly rock cells. Add matching segments end-to-end.",
    size:[72,36,48],color:"#7c8586",parts:mountainSegmentParts(72,36),
  },
  {
    id:"mountain-segment-broad",label:"Mountain segment · Broad · 72 m",category:"blocks",
    description:"72 m segment · 96 m wide × 48 m high · solid low-poly rock cells. Add matching segments end-to-end.",
    size:[96,48,72],color:"#7c8586",parts:mountainSegmentParts(96,48),
  },
  {
    id:"mountain-curved-tunnel",label:"Mountain fabrication · curved tunnel cut",category:"blocks",
    description:"Rock cells leave a curved 90° bore for the measured H27 wide highway bend · separate road surface · 12 m opening.",
    size:[72,36,72],color:"#7c8586",parts:mountainFabrication(true),
  },
  {
    id:"mountain-canal-cut",label:"Mountain canal · excavated passage",category:"blocks",
    description:"Straight 24 m canal cut through a 72 m rock module · solid bed · separate non-solid water surface.",
    size:[72,36,72],color:"#7c8586",parts:mountainCanalParts(),
  },
  {
    id:"mountain-waterfall-roadblock",label:"Waterfall · rock road blocker",category:"blocks",
    description:"Solid cliff face blocks the route; a separate non-solid water curtain marks the waterfall and plunge pool.",
    size:[36,24,20],color:"#727b7d",
    parts:[
      box([0,.5,0],[1,1,1],"#687174"),
      box([0,.43,-.46],[.52,.78,.025],"#55b5ce",false),
      box([0,.08,-.26],[.68,.12,.38],"#376d7c"),
      box([-.44,.44,.03],[.12,.84,.92],"#777f80"),
      box([.44,.44,.03],[.12,.84,.92],"#777f80"),
    ],
  },
  {
    id:"waterfall-lookout-boardwalk",label:"Waterfall lookout · boardwalk end",category:"props",
    description:"Solid timber viewing deck with independent rails · place beside the plunge pool as the ride terminus.",
    size:[24,2,12],color:"#765d45",
    parts:[
      box([0,.12,0],[1,.18,1],"#765d45"),
      box([-.47,.62,0],[.045,.62,.92],"#5c4939"),
      box([.47,.62,0],[.045,.62,.92],"#5c4939"),
      ...[-.32,0,.32].flatMap(z=>[
        {shape:"box" as const,position:[-.47,.36,z] as [number,number,number],size:[.06,.72,.06] as [number,number,number],color:"#584635"},
        {shape:"box" as const,position:[.47,.36,z] as [number,number,number],size:[.06,.72,.06] as [number,number,number],color:"#584635"},
      ]),
    ],
  },
  {
    id:"launch-gallery", label:"Glass run · launch gallery", category:"jumps",
    description:"Open-ended building with an interior ramp rising toward local -Z.",
    size:[15,6,22], color:"#87959e",
    parts:[box([-.48,.5,0],[.04,1,1]),box([.48,.5,0],[.04,1,1]),
      // The deck rises toward local -Z. Placement yaw selects the launch direction.
      {shape:"deck",position:[0,.5,0],size:[.92,1,1],color:"#586977"}],
  },
  {
    id:"breakaway-glass",label:"Breakaway storefront",category:"buildings",
    description:"A full-height pane that shatters under a direct vehicle hit or weapon fire.",
    size:[12,4,.10],color:"#92c1cd",parts:[box([0,.5,0],[1,1,1])],
  },
  chunk(2),
  chunk(3),
  {
    id: "courtyard-block",
    label: "Courtyard block",
    category: "blocks",
    description: "Open courtyard with two explicit building masses · 64 m",
    size: [64, 18, 64],
    color: "#849bad",
    parts: [
      box([0, 0.005, 0], [1, 0.01, 1], "#718695"),
      box([-0.3, 0.505, -0.14], [0.27, 1, 0.6]),
      box([0.3, 0.355, 0.14], [0.27, 0.7, 0.6]),
    ],
  },
  {
    id: "tower",
    label: "Tower",
    category: "buildings",
    description: "Solid 40 m building mass · rooftop landing surface",
    size: [16, 40, 16],
    color: "#63839d",
    parts: [box([0, 0.5, 0], [1, 1, 1])],
  },
  {
    id: "warehouse",
    label: "Open warehouse",
    category: "buildings",
    description: "Three walls and a roof · open front",
    size: [28, 12, 24],
    color: "#8b9fae",
    parts: [
      box([-0.49, 0.5, 0], [0.02, 1, 1]),
      box([0.49, 0.5, 0], [0.02, 1, 1]),
      box([0, 0.5, -0.49], [1, 1, 0.02]),
      box([0, 0.98, 0], [1, 0.04, 1]),
    ],
  },
  {
    id: "small-workshop",
    label: "Small workshop",
    category: "garages",
    description: "Open-front shelter · 8 × 5 × 10 m",
    size: [8, 5, 10],
    color: "#8097a9",
    parts: [
      box([-0.48, 0.5, 0], [0.04, 1, 1]),
      box([0.48, 0.5, 0], [0.04, 1, 1]),
      box([0, 0.5, -0.48], [1, 1, 0.04]),
      box([0, 0.97, 0], [1, 0.06, 1]),
    ],
  },
  {
    id: "ramp-low",
    label: "Low jump ramp",
    category: "jumps",
    description: "2 m rise · low approach",
    size: [8, 2, 12],
    color: "#bc9b69",
    parts: [{ shape: "wedge", position: [0, 0.5, 0], size: [1, 1, 1] }],
  },
  {
    id: "ramp-roof",
    label: "Roof access ramp",
    category: "jumps",
    description: "6 m rise · 24 m run · high edge toward −Z",
    size: [10, 6, 24],
    color: "#bc9b69",
    parts: [{ shape: "wedge", position: [0, 0.5, 0], size: [1, 1, 1] }],
  },
  {
    id: "landing-deck",
    label: "Landing deck",
    category: "jumps",
    description: "Explicit landing slab · set base elevation in inspector",
    size: [12, 0.5, 20],
    color: "#839fb1",
    parts: [box([0, 0.5, 0], [1, 1, 1])],
  },
  {
    id: "route-arrow",
    label: "Route arrow",
    category: "objectives",
    description: "Ground direction marker · no collision",
    size: [3, 0.06, 6],
    color: "#58d2ed",
    parts: arrow,
    solid: false,
  },
  {
    id: "blocking-arrow",
    label: "Blocking arrow",
    category: "objectives",
    description: "Physical road barrier with a direction marker",
    size: [5, 1.5, 1],
    color: "#f1b15b",
    parts: [
      box([0, 0.25, 0], [1, 0.5, 0.5]),
      ...arrow.map((p) => ({
        ...p,
        position: [p.position[0], 0.85, p.position[2]] as [
          number,
          number,
          number,
        ],
        size: [p.size[0], 0.15, p.size[2]] as [number, number, number],
      })),
    ],
  },
  {
    id: "blocking-wall",
    label: "Blocking wall",
    category: "objectives",
    description: "Physical wall · block an approach",
    size: [12, 3, 0.4],
    color: "#c69967",
    parts: [box([0, 0.5, 0], [1, 1, 1])],
  },
  {
    id: "finish-line",
    label: "Finish line",
    category: "objectives",
    description: "Checkered route marker · no race trigger",
    size: [12, 0.05, 2],
    color: "#edf3f7",
    solid: false,
    parts: Array.from({ length: 12 }, (_, i) =>
      box(
        [((i % 6) + 0.5) / 6 - 0.5, 0.5, (Math.floor(i / 6) + 0.5) / 2 - 0.5],
        [1 / 6, 1, 0.5],
        ((i % 6) + Math.floor(i / 6)) % 2 ? "#213042" : "#edf3f7",
        false,
      ),
    ),
  },
  ...(["red", "blue"] as const).map((team) => ({
    id: `ctf-${team}`,
    label: `${team === "red" ? "Red" : "Blue"} CTF area`,
    category: "objectives" as const,
    description: "Capture-area layout marker · game rules are separate",
    size: [14, 0.06, 14] as [number, number, number],
    color: team === "red" ? "#ed6b7a" : "#62adf2",
    solid: false,
    parts: outline(team === "red" ? "#ed6b7a" : "#62adf2"),
  })),
  {
    id: "payload-route",
    label: "Payload escort area",
    category: "objectives",
    description: "Escort-route staging marker · no payload movement logic",
    size: [10, 0.06, 18],
    color: "#a194ee",
    solid: false,
    parts: outline("#a194ee"),
  },
  {
    id: "payload-cart",
    label: "Payload prop",
    category: "objectives",
    description: "Static payload prop · explicit blocking shapes",
    size: [2.5, 2, 4],
    color: "#9f94d8",
    parts: [
      box([0, 0.5, 0], [0.85, 0.7, 0.85]),
      box([0, 0.13, 0], [1, 0.15, 1], "#34465a"),
    ],
  },
];
