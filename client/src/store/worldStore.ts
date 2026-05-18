//  worldStore.ts     ← map/render/block state
import { create } from "zustand";
import type { Quaternion, Vec3 } from "./types";

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


interface WorldState {
  debugEnabled: boolean
  setDebugEnabled: (v: boolean) => void;

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


}


export const useWorldStore = create<WorldState>((set) => ({
  debugEnabled: false,
  setDebugEnabled: (v: boolean) => set({ debugEnabled: v }),

  renderColliders: false,
  setRenderColliders: (v: boolean) => set({ renderColliders: v }),

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
}));
