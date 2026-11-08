import { useEffect, useState, type ReactNode } from "react";
import { useVehicleStudioStore, type VehicleStudioTab } from "./vehicleStudioStore";
import { getPerformanceReadouts, getVehicleStockPerformance, type VehiclePerformanceSummary } from "./vehiclePerformance";

export const VEHICLE_STUDIO_TABS = [
  { id: "overview", label: "OVERVIEW", description: "Vehicle and build summary" },
  { id: "performance", label: "PERFORMANCE", description: "Power, drivetrain and handling" },
  { id: "paint", label: "APPEARANCE", description: "Color, glass and finish" },
  { id: "body", label: "BODY", description: "Doors, panels and glass" },
  { id: "lighting", label: "LIGHTING", description: "Headlights, signals and lamps" },
  { id: "studio", label: "PORTRAIT", description: "Capture the current look" },
] as const;

export type { VehicleStudioTab };
export type { VehiclePerformanceSummary } from "./vehiclePerformance";
export const STOCK_VEHICLE_SUMMARY = getVehicleStockPerformance("gt86");

export function VehicleStudioTabIcon({tab}:{tab:VehicleStudioTab}) {
  const paths:Record<VehicleStudioTab,string>={
    overview:"M3 10 12 3l9 7M5 9v12h14V9M9 21v-7h6v7",
    performance:"M4 20V11M9 20V5M14 20v-8M19 20V8M2 20h20",
    paint:"m14 6 4 4M4 20l4-1 11-11a2.8 2.8 0 0 0-4-4L4 15l-1 5Z",
    body:"M3 14h18l-1.5-5a2 2 0 0 0-2-1.5h-9A2 2 0 0 0 6.5 9L5 14Zm1 0v4h2m14-4v4h-2M7 18h10m-9-2.5h.01m10 0h.01",
    lighting:"M3 10a6 6 0 0 1 0 4h8V10H3Zm11-1 7-4m-7 7h8m-8 3 7 4",
    studio:"M12 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM4 21a8 8 0 0 1 16 0Z",
  };
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d={paths[tab]}/></svg>;
}

export function VehicleStudio({
  name,
  role,
  note,
  vehicleId,
  speedUnit,
  summary = STOCK_VEHICLE_SUMMARY,
  tab,
  footer,
  children,
}: {
  name: string;
  role: string;
  note: string;
  vehicleId: string;
  speedUnit: "kmh" | "mph";
  summary?: VehiclePerformanceSummary;
  tab: VehicleStudioTab;
  footer?: ReactNode;
  children: ReactNode;
}) {
  const setActiveTab = useVehicleStudioStore((state) => state.setActiveTab);
  const [panelOpen, setPanelOpen] = useState(false);
  useEffect(() => {
    setActiveTab(tab);
  }, [setActiveTab, tab]);
  useEffect(() => () => setActiveTab(null), [setActiveTab]);

  const rows = getPerformanceReadouts(summary, speedUnit, vehicleId);
  const selected = VEHICLE_STUDIO_TABS.find((item) => item.id === tab)!;

  return (
    <div className="vehicle-studio">
      <div className="vehicle-studio-main">
        <aside className="vehicle-studio-details" aria-label="Vehicle details and performance">
          <header className="vehicle-studio-identity">
            <h2>{name}</h2>
            <p><strong>{role.toUpperCase()}</strong> · {note}</p>
          </header>
          <section className="vehicle-studio-power" aria-label="Vehicle performance statistics">
            <h3>VEHICLE STATS</h3>
            {rows.map((row) => (
              <div className="vehicle-studio-stat" key={row.key} data-stat={row.key}>
                <div>
                  <span>{row.label}</span>
                  <strong>{row.valueText}</strong>
                </div>
                <meter min={0} max={1.25} value={row.ratio} optimum={1} aria-label={row.label + " " + row.valueText} />
              </div>
            ))}
          </section>
        </aside>

        <section
          hidden={!panelOpen}
          className="vehicle-studio-panel"
          role="tabpanel"
          id="vehicle-studio-tab-panel"
          aria-labelledby={"vehicle-studio-tab-" + tab}
        >
          <header className="vehicle-studio-panel-heading">
            <div><small>{selected.description.toUpperCase()}</small><h2>{selected.label}</h2></div>
            <button type="button" className="vehicle-studio-panel-close" aria-label="Close options panel" onClick={() => setPanelOpen(false)}>×</button>
          </header>
          <div className="vehicle-studio-panel-content">{children}</div>
        </section>
      </div>

      <div className="vehicle-studio-rotate-hint" aria-hidden="true">
        <span>↔</span> DRAG TO ROTATE
      </div>
      <footer className="vehicle-studio-dock">
        <small>QUICK ACTIONS</small>
        <div className="vehicle-studio-dock-actions">
          <button type="button" className="vehicle-studio-panel-toggle" aria-expanded={panelOpen} aria-controls="vehicle-studio-tab-panel" onClick={() => setPanelOpen((open) => !open)}>{panelOpen ? "CLOSE PANEL" : "OPEN " + selected.label}</button>
          {footer}
        </div>
      </footer>
    </div>
  );
}
