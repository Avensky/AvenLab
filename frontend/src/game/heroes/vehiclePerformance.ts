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
  key: keyof VehiclePerformanceSummary | "acceleration" | "quarter_mile" | "fuel_economy";
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
const POUNDS_PER_KG = 2.2046226218;
const WATTS_PER_HP = 745.699872;
const MPH_60_MS = 26.8224;
const KMH_100_MS = 27.7778;
const QUARTER_MILE_METERS = 402.336;
/** In-game comparison estimates until fuel burn is simulated per vehicle. */
const STOCK_MPG_ESTIMATE: Readonly<Record<string, number>> = Object.freeze({
  ae86:28, gt86:27, brz:25, camaro:20, supra:19, mini:30, cx30:29,
  fortuner:22, landcruiser:16, sierra:17, enforcer:19, interceptor:16,
  charger70:13, skyline34:20, timecar:18,
});
const number = (value:number, digits=0) => value.toLocaleString(undefined,{maximumFractionDigits:digits,minimumFractionDigits:digits});
function timeForDistance(distance:number, acceleration:number, topSpeed:number) {
  if (acceleration <= 0 || topSpeed <= 0) return 0;
  const timeToTop = topSpeed / acceleration;
  const distanceToTop = .5 * acceleration * timeToTop * timeToTop;
  return distance <= distanceToTop
    ? Math.sqrt(2 * distance / acceleration)
    : timeToTop + (distance - distanceToTop) / topSpeed;
}

/** Estimates follow the live stock physics profile and the chosen display units. */
export function getPerformanceReadouts(
  summary: VehiclePerformanceSummary,
  speedUnit: "kmh" | "mph" = "kmh",
  vehicle = "gt86",
): PerformanceReadout[] {
  const metric = speedUnit === "kmh";
  const shownSpeed = metric ? summary.max_speed * 3.6 : summary.max_speed * 2.2369362921;
  const targetSpeed = metric ? KMH_100_MS : MPH_60_MS;
  const targetLabel = metric ? "0–100 KM/H" : "0–60 MPH";
  const acceleration = Math.max(.1, Math.min(summary.engine_force / Math.max(1, summary.mass), summary.mu_base * 9.81));
  const accelerationTime = summary.max_speed >= targetSpeed ? targetSpeed / acceleration : 0;
  const quarterMile = timeForDistance(QUARTER_MILE_METERS, acceleration, summary.max_speed);
  const hpAt60 = summary.engine_force * Math.min(summary.max_speed, MPH_60_MS) / WATTS_PER_HP;
  const marine = vehicle === "hawaii-rescue" || vehicle === "louisiana";
  const mpg = STOCK_MPG_ESTIMATE[vehicle];
  const values: PerformanceReadout[] = [
    { key:"engine_force", label:"POWER EST.", value:hpAt60, valueText:`~${number(hpAt60)} HP`, benchmarkText:"650 HP", ratio:hpAt60/650, grade:"" },
    { key:"max_speed", label:"TOP SPEED", value:shownSpeed, valueText:`${number(shownSpeed)} ${metric?"km/h":"mph"}`, benchmarkText:metric?"248 km/h":"154 mph", ratio:summary.max_speed/SUPERCAR_BENCHMARK.max_speed, grade:"" },
    ...(!marine ? [
      { key:"acceleration" as const, label:targetLabel, value:accelerationTime, valueText:accelerationTime?`${number(accelerationTime,1)} s`:"—", benchmarkText:"3.5 s", ratio:accelerationTime?3.5/accelerationTime:0, grade:"" },
      { key:"quarter_mile" as const, label:"¼ MILE", value:quarterMile, valueText:`${number(quarterMile,1)} s`, benchmarkText:"11.0 s", ratio:11/quarterMile, grade:"" },
    ] : []),
    ...(mpg == null ? [] : [{ key:"fuel_economy" as const,label:"FUEL ECONOMY",value:mpg,valueText:`~${mpg} MPG`,benchmarkText:"30 MPG",ratio:mpg/30,grade:"" }]),
    { key:"mass", label:"MASS", value:summary.mass, valueText:metric?`${number(summary.mass)} kg`:`${number(summary.mass*POUNDS_PER_KG)} lb`, benchmarkText:metric?"1,540 kg":"3,395 lb", ratio:SUPERCAR_BENCHMARK.mass/summary.mass, grade:"" },
    { key:"suspension_damping_ratio", label:"SUSPENSION", value:summary.suspension_damping_ratio, valueText:number(summary.suspension_damping_ratio,2), benchmarkText:"1.08", ratio:1-Math.min(1,Math.abs(summary.suspension_damping_ratio-SUPERCAR_BENCHMARK.suspension_damping_ratio)/1.08), grade:"" },
    { key:"mu_base", label:"TIRE GRIP", value:summary.mu_base, valueText:`μ ${number(summary.mu_base,2)}`, benchmarkText:"μ 0.95", ratio:summary.mu_base/SUPERCAR_BENCHMARK.mu_base, grade:"" },
    { key:"brake_force", label:"BRAKES", value:summary.brake_force, valueText:`${number(summary.brake_force/1000,1)} kN`, benchmarkText:"9.0 kN", ratio:summary.brake_force/SUPERCAR_BENCHMARK.brake_force, grade:"" },
  ];
  return values.map((row) => ({ ...row, ratio:clampRatio(row.ratio), grade:gradeFor(clampRatio(row.ratio)) }));
}
