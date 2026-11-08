/**
 * Stock preview values mirror avenlab-server/src/vehicle_setup.rs.
 * Keep this table in sync with the server physics presets; these are in-game
 * tuning values, not claims about the real-world vehicles.
 */
export type VehiclePerformanceSummary = {
  engine_force: number;
  max_speed: number; // m/s
  mu_base: number;
  brake_force: number;
  mass: number; // kg
  suspension_damping_ratio: number;
};
type VehiclePhysics = VehiclePerformanceSummary;
export const VEHICLE_PHYSICS_STOCK: Readonly<Record<string, VehiclePhysics>> = Object.freeze({
  ae86: { mass:950, engine_force:7800, brake_force:6500, max_speed:50, mu_base:.85, suspension_damping_ratio:1.05 },
  gt86: { mass:1270, engine_force:9600, brake_force:7500, max_speed:55, mu_base:.85, suspension_damping_ratio:1.05 },
  brz: { mass:1280, engine_force:10200, brake_force:7600, max_speed:62, mu_base:.85, suspension_damping_ratio:1.05 },
  cx30: { mass:1510, engine_force:10080, brake_force:8600, max_speed:48, mu_base:.85, suspension_damping_ratio:1.05 },
  mini: { mass:1180, engine_force:9360, brake_force:7500, max_speed:53, mu_base:.85, suspension_damping_ratio:1.05 },
  fortuner: { mass:2100, engine_force:12960, brake_force:11300, max_speed:45, mu_base:.85, suspension_damping_ratio:1.05 },
  landcruiser: { mass:2450, engine_force:14280, brake_force:12800, max_speed:43, mu_base:.85, suspension_damping_ratio:1.05 },
  sierra: { mass:2650, engine_force:15720, brake_force:14100, max_speed:45, mu_base:.85, suspension_damping_ratio:1.05 },
  camaro: { mass:1650, engine_force:13200, brake_force:9000, max_speed:65, mu_base:.85, suspension_damping_ratio:.86 },
  supra: { mass:1540, engine_force:12600, brake_force:8800, max_speed:69, mu_base:.95, suspension_damping_ratio:1.08 },
  tank: { mass:40000, engine_force:200000, brake_force:240000, max_speed:30, mu_base:1.2, suspension_damping_ratio:1.1 },
  "hawaii-rescue": { mass:7000000, engine_force:5400000, brake_force:3600000, max_speed:16, mu_base:1.2, suspension_damping_ratio:1.1 },
  louisiana: { mass:48000000, engine_force:35000000, brake_force:22000000, max_speed:14, mu_base:1.2, suspension_damping_ratio:1.1 },
  enforcer: { mass:1270, engine_force:9600, brake_force:7500, max_speed:55, mu_base:.85, suspension_damping_ratio:1.05 },
  interceptor: { mass:1270, engine_force:9600, brake_force:7500, max_speed:55, mu_base:.85, suspension_damping_ratio:1.05 },
  skyline34: { mass:1270, engine_force:9600, brake_force:7500, max_speed:55, mu_base:.85, suspension_damping_ratio:1.05 },
  timecar: { mass:1270, engine_force:9600, brake_force:7500, max_speed:55, mu_base:.85, suspension_damping_ratio:1.05 },
  charger70: { mass:1650, engine_force:13200, brake_force:9000, max_speed:65, mu_base:.85, suspension_damping_ratio:.86 },
});

export const SUPERCAR_BENCHMARK = Object.freeze({
  engine_force: 13200,
  max_speed: 69,
  mass: 1540,
  mu_base: .95,
  brake_force: 9000,
  suspension_damping_ratio: 1.08,
});

export type PerformanceReadout = {
  key: keyof VehiclePerformanceSummary;
  label: string;
  value: number;
  valueText: string;
  benchmarkText: string;
  ratio: number;
  grade: string;
};

export function getVehicleStockPerformance(vehicle: string): VehiclePerformanceSummary {
  const spec = VEHICLE_PHYSICS_STOCK[vehicle] ?? VEHICLE_PHYSICS_STOCK.gt86;
  return { ...spec };
}

/** Vehicle classes have different fictional upgrade ceilings and max stages. */
export function getVehicleTuningLimits(vehicle: string) {
  if (vehicle === "tank") return { engine:1.25, speed:1.08, grip:1.12, brakes:1.2, suspension:1.18, weight:.92, maxStage:2, className:"HEAVY ARMOR" };
  if (vehicle === "hawaii-rescue" || vehicle === "louisiana") return { engine:1.15, speed:1.06, grip:1.08, brakes:1.15, suspension:1.12, weight:.96, maxStage:1, className:"MARINE" };
  if (["cx30","fortuner","landcruiser","sierra","enforcer","interceptor"].includes(vehicle)) return { engine:1.32, speed:1.12, grip:1.16, brakes:1.24, suspension:1.2, weight:.9, maxStage:2, className:"UTILITY" };
  return { engine:1.45, speed:1.2, grip:1.18, brakes:1.32, suspension:1.24, weight:.82, maxStage:3, className:"ROAD" };
}

const gradeFor = (ratio:number) => ratio >= 1 ? "S" : ratio >= .9 ? "A" : ratio >= .78 ? "B" : ratio >= .62 ? "C" : ratio >= .45 ? "D" : "E";
const clampRatio = (value:number) => Math.max(0, Math.min(1.25, value));

export function getPerformanceReadouts(summary: VehiclePerformanceSummary): PerformanceReadout[] {
  const raw = [
    { key:"engine_force" as const, label:"POWER", value:summary.engine_force, valueText:`${(summary.engine_force/1000).toFixed(1)} kN`, benchmarkText:"13.2 kN", ratio:summary.engine_force/SUPERCAR_BENCHMARK.engine_force },
    { key:"max_speed" as const, label:"TOP SPEED", value:summary.max_speed, valueText:`${Math.round(summary.max_speed*3.6)} km/h`, benchmarkText:"248 km/h", ratio:summary.max_speed/SUPERCAR_BENCHMARK.max_speed },
    { key:"mass" as const, label:"MASS", value:summary.mass, valueText:`${Math.round(summary.mass).toLocaleString()} kg`, benchmarkText:"1,540 kg", ratio:SUPERCAR_BENCHMARK.mass/summary.mass },
    { key:"mu_base" as const, label:"TIRE GRIP", value:summary.mu_base, valueText:`μ ${summary.mu_base.toFixed(2)}`, benchmarkText:"μ 0.95", ratio:summary.mu_base/SUPERCAR_BENCHMARK.mu_base },
    { key:"brake_force" as const, label:"BRAKING", value:summary.brake_force, valueText:`${(summary.brake_force/1000).toFixed(1)} kN`, benchmarkText:"9.0 kN", ratio:summary.brake_force/SUPERCAR_BENCHMARK.brake_force },
    { key:"suspension_damping_ratio" as const, label:"SUSPENSION", value:summary.suspension_damping_ratio, valueText:summary.suspension_damping_ratio.toFixed(2), benchmarkText:"1.08 setup", ratio:1-Math.min(1,Math.abs(summary.suspension_damping_ratio-SUPERCAR_BENCHMARK.suspension_damping_ratio)/1.08) },
  ];
  return raw.map((row) => ({ ...row, ratio:clampRatio(row.ratio), grade:gradeFor(row.ratio) }));
}
