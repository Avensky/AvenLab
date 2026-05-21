// import type { PlayerStateInput, VehicleStateInput } from "../store";
// export const VehicleStateBits = {
//     EngineOn: 1 << 0,
//     Headlights: 1 << 1,
//     BlinkerLeft: 1 << 2,
//     BlinkerRight: 1 << 3,
//     Hazards: 1 << 4,
//     ABS: 1 << 5,
//     TCS: 1 << 6,
// }

// export const PlayerStateBits = {
//     Boost: 1 << 0,
//     CanDump: 1 << 1,
//     LiveCan: 1 << 2,
//     Dyno: 1 << 3,
//     Radio: 1 << 4,
//     Honk: 1 << 5,
//     Reset: 1 << 6,
// }

// export function encodeVehicleMask(v: VehicleStateInput): number {
//     let m = 0;
//     if (v.engineOn) m |= VehicleStateBits.EngineOn;
//     if (v.headlights) m |= VehicleStateBits.Headlights;
//     if (v.blinkerLeft) m |= VehicleStateBits.BlinkerLeft;
//     if (v.blinkerRight) m |= VehicleStateBits.BlinkerRight;
//     if (v.hazards) m |= VehicleStateBits.Hazards;
//     if (v.abs) m |= VehicleStateBits.ABS;
//     if (v.tcs) m |= VehicleStateBits.TCS;
//     return m;
// }

// export function encodePlayerMask(p: PlayerStateInput): number {
//     let m = 0;
//     if (p.boost) m |= PlayerStateBits.Boost;
//     if (p.candump) m |= PlayerStateBits.CanDump;
//     if (p.liveCan) m |= PlayerStateBits.LiveCan;
//     if (p.dyno) m |= PlayerStateBits.Dyno;
//     if (p.radio) m |= PlayerStateBits.Radio;
//     if (p.honk) m |= PlayerStateBits.Honk;
//     if (p.reset) m |= PlayerStateBits.Reset;
//     return m;
// }