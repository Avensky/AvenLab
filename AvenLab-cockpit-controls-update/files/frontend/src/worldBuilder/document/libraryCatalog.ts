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
  { id: "props", label: "Props" },
] as const;
export type LibraryTab = (typeof LIBRARY_TABS)[number]["id"];
export function inLibraryTab(piece: Piece, tab: LibraryTab) {
  if (tab === "all") return true;
  if (tab === "garages")
    return (
      Boolean(piece.model) ||
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
