// VehicleStateFlags — MUST match Rust bit layout
export const VehicleFlags = {
  ENGINE_ON: 1 << 0,
  HEADLIGHTS: 1 << 1,
  BLINKER_LEFT: 1 << 2,
  BLINKER_RIGHT: 1 << 3,
  HAZARDS: 1 << 4,
  ABS: 1 << 5,
  TCS: 1 << 6,
  BOOST: 1 << 7,
} as const;

// PlayerFlags — you can expand later
export const PlayerFlags = {
  CANDUMP: 1 << 0,
  LIVECAN: 1 << 1,
  DYNO: 1 << 2,
  RADIO: 1 << 3,
  HONK: 1 << 4,
  RESET: 1 << 5,
} as const;

export function setFlag(mask: number, flag: number, enabled: boolean) {
  return enabled ? mask | flag : mask & ~flag;
}

export function hasFlag(mask: number, flag: number) {
  return (mask & flag) !== 0;
}


