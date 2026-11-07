import { useEffect, type ReactNode } from "react";
import { useVehicleStudioStore, type VehicleStudioTab } from "./vehicleStudioStore";

export const VEHICLE_STUDIO_TABS = [
  { id: "overview", label: "OVERVIEW", description: "Vehicle and build summary" },
  { id: "performance", label: "PERFORMANCE", description: "Power, drivetrain and handling" },
  { id: "paint", label: "APPEARANCE", description: "Color, glass and finish" },
  { id: "body", label: "BODY", description: "Doors, panels and glass" },
  { id: "lighting", label: "LIGHTING", description: "Headlights, signals and lamps" },
  { id: "studio", label: "PORTRAIT", description: "Capture the current look" },
] as const;

export type { VehicleStudioTab };
export type VehiclePerformanceSummary = {
  engine_force: number;
  max_speed: number;
  mu_base: number;
  brake_force: number;
  suspension_damping_ratio: number;
  fuel_consumption: number;
};
export const STOCK_VEHICLE_SUMMARY: VehiclePerformanceSummary = {
  engine_force: 1,
  max_speed: 1,
  mu_base: 1,
  brake_force: 1,
  suspension_damping_ratio: 1,
  fuel_consumption: 1,
};

export function VehicleStudio({
  name,
  role,
  note,
  stats,
  summary = STOCK_VEHICLE_SUMMARY,
  tab,
  onTab,
  footer,
  children,
}: {
  name: string;
  role: string;
  note: string;
  stats: { armor: number; speed: number; handling: number; support: number };
  summary?: VehiclePerformanceSummary;
  tab: VehicleStudioTab;
  onTab: (tab: VehicleStudioTab) => void;
  footer?: ReactNode;
  children: ReactNode;
}) {
  const setActiveTab = useVehicleStudioStore((state) => state.setActiveTab);
  useEffect(() => {
    setActiveTab(tab);
  }, [setActiveTab, tab]);
  useEffect(() => () => setActiveTab(null), [setActiveTab]);

  const rows: [string, number, string][] = [
    ["POWER", summary.engine_force, "relative"],
    ["TOP SPEED", summary.max_speed, "relative"],
    ["FUEL CONSUMPTION", summary.fuel_consumption, "relative"],
    ["TIRE GRIP", summary.mu_base, "relative"],
    ["BRAKES", summary.brake_force, "relative"],
    ["SUSPENSION", summary.suspension_damping_ratio, "relative"],
    ["ARMOR", stats.armor, "rating"],
  ];
  const selected = VEHICLE_STUDIO_TABS.find((item) => item.id === tab)!;

  return (
    <div className="vehicle-studio">
      <nav className="vehicle-studio-tabs" role="tablist" aria-label="Heroes garage sections">
        {VEHICLE_STUDIO_TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            id={"vehicle-studio-tab-" + item.id}
            aria-selected={tab === item.id}
            aria-controls="vehicle-studio-tab-panel"
            className="vehicle-studio-tab"
            onClick={() => onTab(item.id)}
          >
            <span>{item.label}</span>
            <small>{item.description}</small>
          </button>
        ))}
      </nav>

      <div className="vehicle-studio-main">
        <aside className="vehicle-studio-details" aria-label="Power and vehicle details">
          <header>
            <small>{role.toUpperCase()} · VEHICLE DETAILS</small>
            <h2>{name}</h2>
            <p>{note}</p>
          </header>
          <section className="vehicle-studio-power">
            <h3>PERFORMANCE PROFILE</h3>
            {rows.map(([label, value, kind]) => (
              <div className="vehicle-studio-stat" key={label}>
                <div>
                  <span>{label}</span>
                  <strong>
                    {kind === "rating"
                      ? Math.round(value) + " / 100"
                      : Math.round(value * 100) + "%"}
                  </strong>
                </div>
                <meter
                  min={0}
                  max={kind === "rating" ? 100 : 1.5}
                  value={Math.max(0, Math.min(kind === "rating" ? 100 : 1.5, kind === "rating" ? value : value))}
                  optimum={kind === "rating" ? 100 : 1}
                  aria-label={label + (kind === "rating" ? " rating" : " relative to stock")}
                />
              </div>
            ))}
            <p className="vehicle-studio-estimate">Build estimates · stock baseline = 100%</p>
          </section>
          <section className="vehicle-studio-class-stats" aria-label="Vehicle class ratings">
            <h3>CLASS PROFILE</h3>
            {([
              ["SPEED", stats.speed],
              ["HANDLING", stats.handling],
              ["SUPPORT", stats.support],
            ] as const).map(([label, value]) => (
              <div key={label}>
                <span>{label}</span>
                <strong>{value}</strong>
              </div>
            ))}
          </section>
        </aside>

        <section
          className="vehicle-studio-panel"
          role="tabpanel"
          id="vehicle-studio-tab-panel"
          aria-labelledby={"vehicle-studio-tab-" + tab}
        >
          <header className="vehicle-studio-panel-heading">
            <small>{selected.description.toUpperCase()}</small>
            <h2>{selected.label}</h2>
          </header>
          <div className="vehicle-studio-panel-content">{children}</div>
        </section>
      </div>

      <div className="vehicle-studio-rotate-hint" aria-hidden="true">
        <span>↔</span> DRAG TO ROTATE
      </div>
      <footer className="vehicle-studio-dock">
        <small>{selected.label} OPTIONS</small>
        <div className="vehicle-studio-dock-actions">{footer ?? <span>{selected.description}</span>}</div>
      </footer>
    </div>
  );
}
