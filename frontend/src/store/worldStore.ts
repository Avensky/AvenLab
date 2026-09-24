//  worldStore.ts     ← map/render/block state
import { create } from "zustand";
import type { Quaternion, Vec3 } from "./types";
import { DebugFlags, toggleDebugFlag } from "./tools/debugMasks";

export type StructureState = "intact" | "damaged" | "destroyed" | "removed"
export type ColliderKind = "box"
export type BlockObjectKind = "road" | "intersection" | "building" | "prop"

export interface BlockObject {
  id: string;
  kind: BlockObjectKind;
  visual: string;
  pos: Vec3;
  rot: Quaternion;
  half_extents: Vec3;
  collider: ColliderKind;
  destructible?: boolean;
  state?: StructureState;
}

export interface BlockColliderFile {
  block_id: string;
  version: number;
  cell: [number, number];
  roads: BlockObject[];
  buildings: BlockObject[];
}

export type RenderMode = "glb" | "geometry" | "collider" | "hybrid"

export type MapCoordinateSystem = {
  units: string;
  up_axis: string;
  forward_axis: string;
};

export type MapSurface = {
  road_y: number;
};

export type FixedGridLayout = {
  kind: "fixed_grid";
  origin: [number, number];
  size: [number, number];
};

export type StreamedLayout = {
  kind: "streamed";
  radius: number;
};

export type MapLayout = FixedGridLayout | StreamedLayout;

export type VisualAsset = {
  id: string;
  asset: string;
  position: [number, number, number];
  rotation: [number, number, number, number];
  scale: [number, number, number];
};

export type LoadedChunkInstance = {
  x: number;
  z: number;
  origin: [number, number, number];
};

export type MapSnapshot = {
  schema_version: number;
  map_id: string;

  coordinate_system: MapCoordinateSystem;

  cell: [number, number];

  surface: MapSurface;

  layout: MapLayout;

  visuals: VisualAsset[];

  chunks: LoadedChunkInstance[];
};

interface WorldState {
  debugEnabled: boolean
  setDebugEnabled: (v: boolean) => void;

  debugMask: number;
  setDebugMask: (mask: number) => void;
  toggleDebugFlag: (flag: number) => void;

  renderChassis: boolean
  setRenderChassis: (v: boolean) => void;

  renderColliders: boolean
  setRenderColliders: (v: boolean) => void;

  renderWheels: boolean
  setRenderWheels: (v: boolean) => void;

  renderRays: boolean
  setRenderRays: (v: boolean) => void;

  renderAabbs: boolean
  setRenderAabbs: (v: boolean) => void;

  mode: RenderMode
  setMode: (mode: RenderMode) => void

  activeBlock: BlockColliderFile | null
  setActiveBlock: (block: BlockColliderFile | null) => void

  map: MapSnapshot | null;
  setMap: (map: MapSnapshot | null) => void;
}


export const useWorldStore = create<WorldState>((set) => ({
  debugEnabled: false,
  setDebugEnabled: (v: boolean) => set({ debugEnabled: v }),


  debugMask: DebugFlags.NONE,
  setDebugMask: (mask: number) => set({ debugMask: mask }),
  toggleDebugFlag: (flag: number) =>
    set((s) => ({ debugMask: toggleDebugFlag(s.debugMask, flag) })),

  renderColliders: false,
  setRenderColliders: (v: boolean) => set({ renderColliders: v }),

  renderChassis: false,
  setRenderChassis: (v: boolean) => set({ renderChassis: v }),
  
  renderWheels: false,
  setRenderWheels: (v: boolean) => set({ renderWheels: v }),

  renderRays: false,
  setRenderRays: (v: boolean) => set({ renderRays: v }),

  renderAabbs: false,
  setRenderAabbs: (v: boolean) => set({ renderAabbs: v }),

  mode: "hybrid",
  setMode: (mode) => set({ mode }),

  activeBlock: null,
  setActiveBlock: (block) => set({ activeBlock: block }),

  map: null,
  setMap: (map) => set({ map }),

}));
