import data from "../../../public/models/roads/catalog.json" with { type: "json" };
import type { Piece, V3 } from "../document/layoutDocument.ts";

export type Socket = {
  position: V3;
  forwardXZ: [number, number];
  widthM: number;
};
type Bounds = { min: V3; max: V3 };
export type KitAsset = {
  id: string;
  node?: string;
  lodFiles: string[];
  collisionFile: string;
  bounds: Bounds;
  size: V3;
  sockets: Socket[];
  permanent: boolean;
  label: string;
};

function size(b: Bounds): V3 {
  return b.max.map((v, i) => v - b.min[i]) as V3;
}
const modules: KitAsset[] = data.pieces.map((p) => {
  const bounds = p.boundsLocalM as Bounds;
  const label = p.id
    .replace(/^highway_(\d+)_/, "H$1 · ")
    .replaceAll("_", " ")
    .replace(/bend(\d+)/, "$1° bend")
    .replace(/rise(\d+)/, "+$1 m");
  return {
    id: p.id,
    node: p.node,
    lodFiles: p.lods.map((l) => l.file),
    collisionFile: p.collider,
    bounds,
    size: size(bounds),
    sockets: (p.sockets ?? []) as Socket[],
    permanent: p.destructible === false,
    label: label[0].toUpperCase() + label.slice(1),
  };
});
const presets: KitAsset[] = data.presets.map((p) => {
  const bounds: Bounds = {
    min: [Infinity, Infinity, Infinity],
    max: [-Infinity, -Infinity, -Infinity],
  };
  for (const placement of p.placements) {
    const module = modules.find((a) => a.id === placement.piece)!;
    placement.position.forEach((offset, i) => {
      bounds.min[i] = Math.min(bounds.min[i], offset + module.bounds.min[i]);
      bounds.max[i] = Math.max(bounds.max[i], offset + module.bounds.max[i]);
    });
  }
  return {
    id: p.id,
    label: "Stone bridge · 120 m",
    lodFiles: p.lodFiles,
    collisionFile: p.collisionFile,
    sockets: p.sockets as Socket[],
    permanent: !p.destructible,
    bounds,
    size: size(bounds),
  };
});
export const kitAssets = [...presets, ...modules];
const byPiece = new Map(kitAssets.map((asset) => [`kit-${asset.id}`, asset]));
export const kitAsset = (piece: string) => byPiece.get(piece);
export const kitPieces: Piece[] = kitAssets.map((asset) => ({
  id: `kit-${asset.id}`,
  label: asset.label,
  category: "roads",
  size: asset.size,
  description: asset.permanent
    ? "Stone masonry · permanent crossing"
    : "Modular highway · measured driving surface",
  color: asset.permanent ? "#887e74" : "#525960",
  parts: [],
}));
