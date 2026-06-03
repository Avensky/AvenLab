// src/store/tools/debugMasks.ts
export const DebugFlags = {
  NONE: 0,
  CHASSIS: 1 << 0,
  WHEELS: 1 << 1,
  RAYS: 1 << 2,
  SLIP: 1 << 3,
  LOAD_BARS: 1 << 4,
  ARB: 1 << 5,
  BLOCKS: 1 << 6,
} as const;

export type DebugFlag = typeof DebugFlags[keyof typeof DebugFlags];

export function hasDebugFlag(mask: number, flag: number) {
  return (mask & flag) !== 0;
}

export function toggleDebugFlag(mask: number, flag: number) {
  return mask ^ flag;
}