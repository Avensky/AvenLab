// Optional confirmed telltales from a simulation/CAN adapter. Application flags,
// never invented vehicle-specific CAN identifiers or unimplemented fault models.
export const ClusterFlags = {
  TIRE_PRESSURE_LOW: 1 << 0,
  DOOR_OPEN: 1 << 1,
  CRUISE_ON: 1 << 2,
  HIGH_BEAM: 1 << 3,
  EPS_WARNING: 1 << 4,
  LOW_OIL: 1 << 5,
  LOW_BATTERY: 1 << 6,
  ENGINE_WARNING: 1 << 7,
  SEATBELT: 1 << 8,
  PARK_BRAKE: 1 << 9,
  TRACTION_ACTIVE: 1 << 10,
  FOG_LIGHT: 1 << 11,
  LOW_FUEL: 1 << 12,
} as const;
export const CLUSTER_KNOWN_MASK = Object.values(ClusterFlags).reduce(
  (mask, flag) => mask | flag,
  0,
);
export function clusterFlag(mask: number | null, flag: number) {
  return mask !== null && (mask & flag) !== 0;
}
