/** Shared line icons for the garage statistics and upgrade controls. */
const PATHS: Record<string, string> = {
  engine_force: "M3 9h3l2-3h8l2 3h3v8h-3l-2 3H8l-2-3H3zM8 9v2m8-2v2",
  max_speed: "M4 18a8 8 0 1 1 16 0M12 12l4-4M5 18h14",
  acceleration: "M9 3h6m-3 0v3m6 0 2 2M12 6a7 7 0 1 0 0 14 7 7 0 0 0 0-14Zm0 3v5l3 2",
  quarter_mile: "M4 21V3m0 2h15l-3 4 3 4H4M9 5v8m5-8v8M4 9h13",
  fuel_economy: "M5 3h10v18H5zM7 6h6v5H7zM15 8h2l3 3v7h-2v-5h-3",
  mass: "M9 7V5a3 3 0 0 1 6 0v2M6 7h12l3 14H3L6 7Z",
  suspension_damping_ratio: "M12 2v3m0 14v3M8 5h8l-8 3 8 3-8 3 8 3-8 2h8",
  mu_base: "M8 3h8a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3Zm1 0v18m6-18v18M5 8h4m6 0h4M5 16h4m6 0h4",
  brake_force: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 6a3 3 0 1 0 0 6 3 3 0 0 0 0-6ZM8 6h1m6 0h1M8 18h1m6 0h1",
  nitrous: "m15 2 4 4-3 3-4-4 3-3Zm-3 3-7 7a4 4 0 0 0 0 6l1 1a4 4 0 0 0 6 0l7-7-7-7Zm-4 9 5-5m-3 7 5-5",
  intercooler: "M4 5h16v14H4zM1 9h3m16 6h3M7 8h10M7 11h10M7 14h10M7 17h10",
  gearing: "M6 3v18m6-18v18m6-18v9H6M4 3h4m2 0h4m2 0h4M4 21h4m2 0h4",
  exhaust: "M3 10h7l4-4h7v9h-7l-4 4H3zM17 6v9",
  tune: "M4 7h16M4 12h16M4 17h16M8 5v4M16 10v4M10 15v4",
};
const ALIASES: Record<string, string> = {
  turbo: "engine_force", engine: "engine_force", tires: "mu_base",
  suspension: "suspension_damping_ratio", brakes: "brake_force",
  weight: "mass", transmission: "gearing", fuel: "fuel_economy",
};
export function VehicleGarageIcon({ name }: { name: string }) {
  return <svg className="vehicle-garage-icon" viewBox="0 0 24 24" aria-hidden="true"><path d={PATHS[ALIASES[name] ?? name] ?? PATHS.tune} /></svg>;
}
