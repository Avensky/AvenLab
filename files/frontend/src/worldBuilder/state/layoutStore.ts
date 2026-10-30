import { create } from "zustand";
import {
  addPiece,
  degrees,
  duplicatePiece,
  emptyLayout,
  exampleLayout,
  layoutJSON,
  parseLayout,
  parseLayoutText,
  removePiece,
  updatePiece,
  type LayoutObject,
  type V3,
  type WorldLayout,
} from "../document/layoutDocument";
import { updateSpawn, type LayoutSpawn } from "../document/spawnDocument";
import { snapLayoutPosition } from "../roads/layoutSnapping";
type LayoutState = {
  doc: WorldLayout | null;
  saved: WorldLayout | null;
  past: WorldLayout[];
  future: WorldLayout[];
  selectedSpawn: string | null;
  selectSpawn: (id: string | null) => void;
  addSpawn: (team: "red" | "blue", position: V3, yaw?: number) => void;
  updateSpawn: (changes: Partial<Omit<LayoutSpawn, "id">>) => void;
  removeSpawn: () => void;
  selected: string | null;
  placing: string | null;
  tool: "select" | "translate" | "rotate" | "scale";
  focus: "layout" | "selected";
  view: "3d" | "plan";
  camera: "iso" | "top";
  cameraRevision: number;
  snap: number;
  angleSnap: number;
  magnet: boolean;
  snapBasis: "outer" | "asphalt";
  magnetRadius: number;
  cursor: V3;
  placementYaw: number;
  reference: boolean;
  wireframe: boolean;
  status: string;
  initialize: (
    mapId: string,
    source?: unknown,
    sourceSpawns?: LayoutSpawn[],
  ) => void;
  commit: (doc: WorldLayout, status?: string) => void;
  select: (id: string | null) => void;
  cycle: (dir: number) => void;
  place: (position: V3) => void;
  update: (changes: Parameters<typeof updatePiece>[2]) => void;
  duplicate: () => void;
  remove: () => void;
  undo: () => void;
  redo: () => void;
  save: () => boolean;
  restore: () => void;
  newLayout: (example?: boolean, surface?: number) => void;
  rotate: (direction: number) => void;
};
let prefix = "avenlab-layout-v1";
export const configureLayoutPreview = () => {
  prefix = "avenlab-layout-preview-v1";
};
export const layoutStorageKey = (mapId: string) => `${prefix}:${mapId}`;
const chosen = (doc: WorldLayout, selected: string | null) =>
  doc.objects.some((o) => o.id === selected) ? selected : null;
export const useLayoutStore = create<LayoutState>((set, get) => ({
  selectedSpawn: null,
  selectSpawn: (selectedSpawn) =>
    set({ selectedSpawn, selected: null, placing: null }),
  addSpawn: (team, position, yaw = 0) => {
    const s = get();
    if (!s.doc) return;
    let n = 1;
    while (s.doc.spawns?.some((p) => p.id === `spawn-${team}-${n}`)) n++;
    const spawn = { id: `spawn-${team}-${n}`, team, position, yaw };
    s.commit(
      { ...s.doc, spawns: [...(s.doc.spawns ?? []), spawn] },
      "Spawn point placed.",
    );
    set({ selectedSpawn: spawn.id, selected: null, placing: null });
  },
  updateSpawn: (changes) => {
    const s = get();
    if (s.doc && s.selectedSpawn)
      s.commit(
        updateSpawn(s.doc, s.selectedSpawn, changes),
        "Spawn point updated.",
      );
  },
  removeSpawn: () => {
    const s = get();
    if (s.doc && s.selectedSpawn) {
      s.commit(
        {
          ...s.doc,
          spawns: s.doc.spawns?.filter((p) => p.id !== s.selectedSpawn),
        },
        "Spawn removed.",
      );
      set({ selectedSpawn: null });
    }
  },
  doc: null,
  saved: null,
  past: [],
  future: [],
  selected: null,
  placing: null,
  tool: "select",
  magnet: true,
  snapBasis: "outer",
  magnetRadius: 1.5,
  focus: "layout",
  view: "3d",
  camera: "iso",
  cameraRevision: 0,
  snap: 0.5,
  angleSnap: 15,
  cursor: [0, 0, 0],
  placementYaw: 0,
  reference: false,
  wireframe: false,
  status: "Choose a piece, then click the ground to place it.",
  initialize: (mapId, source, sourceSpawns) => {
    if (get().doc?.map_id === mapId) return;
    let doc = source ? parseLayout(source, mapId) : emptyLayout(mapId),
      saved: WorldLayout | null = null;
    try {
      const text = localStorage.getItem(layoutStorageKey(mapId));
      if (text) {
        doc = parseLayoutText(text, mapId);
        saved = doc;
      }
    } catch {
      /* A broken or unavailable draft cannot prevent opening the editor. */
    }
    if (doc.spawns === undefined && sourceSpawns)
      doc = parseLayout({ ...doc, spawns: sourceSpawns }, mapId);
    set({
      selectedSpawn: null,
      doc,
      saved,
      past: [],
      future: [],
      selected: null,
      placing: null,
      reference: false,
      cameraRevision: get().cameraRevision + 1,
    });
  },
  commit: (candidate, status = "Layout updated.") => {
    const s = get(),
      doc = parseLayout(candidate, s.doc?.map_id);
    if (!s.doc || JSON.stringify(doc) === JSON.stringify(s.doc)) return;
    set({
      doc,
      past: [...s.past, s.doc].slice(-64),
      future: [],
      selected: chosen(doc, s.selected),
      selectedSpawn: doc.spawns?.some((p) => p.id === s.selectedSpawn)
        ? s.selectedSpawn
        : null,
      status,
    });
  },
  select: (selected) => set({ selected, selectedSpawn: null, placing: null }),
  cycle: (dir) => {
    const s = get(),
      objects = s.doc?.objects ?? [];
    if (!objects.length) return;
    const index = objects.findIndex((o) => o.id === s.selected);
    set({
      selected: objects[(index + dir + objects.length) % objects.length].id,
      placing: null,
    });
  },
  place: (position) => {
    const s = get();
    if (!s.doc || !s.placing) return;
    let doc = addPiece(s.doc, s.placing, position, s.placementYaw);
    const placed = doc.objects.at(-1)!;
    if (s.magnet) {
      const result = snapLayoutPosition(
        placed,
        position,
        s.doc.objects,
        s.snapBasis,
        s.magnetRadius,
      );
      placed.position = result.position;
      doc = parseLayout(doc);
    }
    s.commit(doc, "Piece placed. Click again to place another; Esc finishes.");
    set({ selected: doc.objects.at(-1)!.id, cursor: position });
  },
  update: (changes) => {
    const s = get();
    if (s.doc && s.selected) s.commit(updatePiece(s.doc, s.selected, changes));
  },
  duplicate: () => {
    const s = get();
    if (!s.doc || !s.selected) return;
    const doc = duplicatePiece(s.doc, s.selected, Math.max(s.snap, 1));
    s.commit(doc, "Duplicate created.");
    set({ selected: doc.objects.at(-1)!.id, placing: null, tool: "translate" });
  },
  remove: () => {
    const s = get();
    if (s.doc && s.selected)
      s.commit(removePiece(s.doc, s.selected), "Piece removed.");
  },
  undo: () => {
    const s = get(),
      doc = s.past.at(-1);
    if (!doc || !s.doc) return;
    set({
      doc,
      past: s.past.slice(0, -1),
      future: [s.doc, ...s.future].slice(0, 64),
      selected: chosen(doc, s.selected),
      selectedSpawn: doc.spawns?.some((p) => p.id === s.selectedSpawn)
        ? s.selectedSpawn
        : null,
      placing: null,
      status: "Undid last edit.",
    });
  },
  redo: () => {
    const s = get(),
      doc = s.future[0];
    if (!doc || !s.doc) return;
    set({
      doc,
      past: [...s.past, s.doc].slice(-64),
      future: s.future.slice(1),
      selected: chosen(doc, s.selected),
      selectedSpawn: doc.spawns?.some((p) => p.id === s.selectedSpawn)
        ? s.selectedSpawn
        : null,
      placing: null,
      status: "Redid last edit.",
    });
  },
  save: () => {
    const s = get();
    if (!s.doc) return false;
    try {
      localStorage.setItem(layoutStorageKey(s.doc.map_id), layoutJSON(s.doc));
      set({
        saved: s.doc,
        status: "Saved in this browser. Export a file to keep a portable copy.",
      });
      return true;
    } catch {
      set({
        status: "Browser save unavailable. Export your layout JSON to keep it.",
      });
      return false;
    }
  },
  restore: () => {
    const s = get();
    if (!s.doc) return;
    const text = localStorage.getItem(layoutStorageKey(s.doc.map_id));
    if (!text) throw Error("No saved layout for this map");
    const doc = parseLayoutText(text, s.doc.map_id);
    s.commit(doc, "Restored saved layout. Undo is available.");
    set({ saved: get().doc, cameraRevision: s.cameraRevision + 1 });
  },
  newLayout: (example = false, surface = 0) => {
    const s = get();
    if (!s.doc) return;
    s.commit(
      example
        ? exampleLayout(s.doc.map_id, surface)
        : emptyLayout(s.doc.map_id),
      example
        ? "Example layout loaded."
        : "New layout. Your previous work is available with Undo.",
    );
    set({
      selected: null,
      placing: null,
      cameraRevision: s.cameraRevision + 1,
    });
  },
  rotate: (direction) => {
    const s = get();
    if (s.placing)
      set({ placementYaw: degrees(s.placementYaw + direction * s.angleSnap) });
    else if (s.selectedSpawn) {
      const spawn = s.doc?.spawns?.find((p) => p.id === s.selectedSpawn);
      if (spawn)
        s.updateSpawn({ yaw: degrees(spawn.yaw + direction * s.angleSnap) });
    } else if (s.selected) {
      const item = s.doc?.objects.find((o) => o.id === s.selected);
      if (item) s.update({ yaw: item.yaw + direction * s.angleSnap });
    }
  },
}));
export function layoutAction(action: () => unknown) {
  try {
    action();
    return true;
  } catch (error) {
    useLayoutStore.setState({
      status: error instanceof Error ? error.message : "Edit rejected",
    });
    return false;
  }
}
export const selectedPiece = (): LayoutObject | undefined => {
  const s = useLayoutStore.getState();
  return s.doc?.objects.find((o) => o.id === s.selected);
};
