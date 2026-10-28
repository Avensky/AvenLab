// One optional u32 alongside existing input. Top command bits are requests;
// snapshots reuse them for confirmed status. Never interpret one as the other.
export type CockpitCommand = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;
export type CockpitRequest = {
  lights: number; wipers: number; assist: number; automatic: boolean; gear: number;
  parking: boolean; washer: boolean; cruiseEnabled: boolean; cruiseAction: number; revision: number;
};
export const DEFAULT_COCKPIT_MASK = (1 << 6) | (1 << 7); // automatic Drive
export function unpackCockpit(mask = DEFAULT_COCKPIT_MASK): CockpitRequest {
  return { lights: mask & 3, wipers: (mask >>> 2) & 3, assist: (mask >>> 4) & 3,
    automatic: Boolean(mask & (1 << 6)), gear: (mask >>> 7) & 15,
    parking: Boolean(mask & (1 << 11)), washer: Boolean(mask & (1 << 12)),
    cruiseEnabled: Boolean(mask & (1 << 13)), cruiseAction: (mask >>> 14) & 3, revision: (mask >>> 16) & 255 };
}
export function reviseCockpit(mask: number | undefined, patch: Partial<CockpitRequest>, command: CockpitCommand): number {
  const old = unpackCockpit(mask), next = { ...old, ...patch, revision: (old.revision + 1) & 255 };
  const integer = (value: number, max: number) => Number.isInteger(value) ? Math.max(0, Math.min(max, value)) : 0;
  return (integer(next.lights, 3) | (integer(next.wipers, 3) << 2) | (integer(next.assist, 3) << 4)
    | (Number(next.automatic) << 6) | (integer(next.gear, 8) << 7) | (Number(next.parking) << 11)
    | (Number(next.washer) << 12) | (Number(next.cruiseEnabled) << 13) | (integer(next.cruiseAction, 3) << 14)
    | (next.revision << 16) | (command << 24)) >>> 0;
}
export function cockpitStatus(mask: number | null) {
  return { cruiseActive: mask !== null && Boolean(mask & (1 << 24)), tractionRearmed: mask !== null && Boolean(mask & (1 << 25)),
    parkingActive: mask !== null && Boolean(mask & (1 << 26)), rejection: mask === null ? 0 : mask >>> 28 };
}
