// VehicleStateFlags — MUST match Rust bit layout
export const VehicleFlags = {
  ENGINE_ON: 1 << 0,
  HEADLIGHTS: 1 << 1,
  BLINKER_LEFT: 1 << 2,
  BLINKER_RIGHT: 1 << 3,
  HAZARDS: 1 << 4,
  ABS: 1 << 5,
  TCS: 1 << 6,
} as const;

// PlayerFlags — you can expand later
export const PlayerFlags = {
  BOOST: 1 << 0,
  CANDUMP: 1 << 1,
  LIVECAN: 1 << 2,
  DYNO: 1 << 3,
  RADIO: 1 << 4,
  HONK: 1 << 5,
  RESET: 1 << 6,
} as const;


