import { useEffect, useState, type ReactNode } from "react";
import { useVehicleStudioStore, type VehicleStudioTab } from "./vehicleStudioStore";
import { getPerformanceReadouts, getVehicleStockPerformance, getVehicleTuningLimits, type VehiclePerformanceSummary } from "./vehiclePerformance";

import { VehicleGarageIcon } from "./VehicleGarageIcon";
import { VehicleDrivetrainSummary } from "./VehicleDrivetrainSummary";

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

type GarageStat = { key: string; label: string; valueText: string; ratio: number; title?: string };

function GarageStatCell({ row }: { row: GarageStat }) {
  return <div className="vehicle-studio-stat" data-stat={row.key} title={row.title}>
    <VehicleGarageIcon name={row.key} />
    <div className="vehicle-studio-stat-main">
      <div className="vehicle-studio-stat-line"><span>{row.label}</span><strong>{row.valueText}</strong></div>
      <meter min={0} max={1.25} value={row.ratio} optimum={1} aria-label={`${row.label} ${row.valueText}`} />
    </div>
  </div>;
}

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
  stages = {},
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
  stages?: Record<string, number>;
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
  const limits = getVehicleTuningLimits(vehicleId);
  const stage = (id: string) => Math.max(0, Math.min(limits.maxStage, stages[id] ?? 0));
  const pairs: GarageStat[][] = [
    ["engine_force", "max_speed"], ["acceleration", "quarter_mile"], ["mu_base", "brake_force"],
  ].map(keys => rows.filter(row => keys.includes(row.key)).sort((a, b) => keys.indexOf(a.key) - keys.indexOf(b.key))).filter(pair => pair.length > 0);
  pairs.push([
    { key: "nitrous", label: "NITROUS", valueText: stage("nitrous") ? `STAGE ${stage("nitrous")}` : "STOCK", ratio: stage("nitrous") / limits.maxStage * 1.25, title: "Selected nitrous upgrade stage" },
    { key: "intercooler", label: "COOLING", valueText: stage("intercooler") ? `+${stage("intercooler") * 10}%` : "STOCK", ratio: stage("intercooler") / limits.maxStage * 1.25, title: "Intercooler cooling capacity bonus; not live engine temperature" },
  ]);
  const optionsOpen = panelOpen && tab !== "overview";
  // Only the paint palette needs a dock beside the live vehicle preview.
  const showDock = optionsOpen && tab === "paint" && footer != null;


  return (
    <div className="vehicle-studio" data-has-dock={showDock}>
      <div className="vehicle-studio-main">
        <aside className="vehicle-studio-details" aria-label="Vehicle details and performance">
          <div className="vehicle-studio-baseline">
            <header className="vehicle-studio-identity">
              <h2>{name}</h2>
              <p><strong>{role.toUpperCase()}</strong> · {note}</p>
            </header>
            <section className="vehicle-studio-power" aria-label="Vehicle performance statistics">
              {pairs.map(pair => <div className="vehicle-studio-stat-pair" key={pair[0].key} data-count={pair.length}>
                {pair.map(row => <GarageStatCell key={row.key} row={row} />)}
              </div>)}
            </section>
          </div>
          <VehicleDrivetrainSummary vehicle={vehicleId} weight={rows.find(row => row.key === "mass")?.valueText ?? "—"} economy={rows.find(row => row.key === "fuel_economy")?.valueText} suspension={stage("suspension")} damping={summary.suspension_damping_ratio} />
        </aside>

        <section
          hidden={!optionsOpen}
          className="vehicle-studio-panel"
          role="tabpanel"
          id="vehicle-studio-tab-panel"
          aria-labelledby={"vehicle-studio-tab-" + tab}
        >
          <header className="vehicle-studio-panel-heading">
            <h2>{tab === "performance" ? "UPGRADES" : selected.label}</h2>
            <button type="button" className="vehicle-studio-panel-close" aria-label="Close options panel" onClick={() => setPanelOpen(false)}>×</button>
          </header>
          <div className="vehicle-studio-panel-content">{children}</div>
          {!showDock && footer && <div className="vehicle-studio-panel-actions">{footer}</div>}
        </section>
        {!optionsOpen && tab !== "overview" && <button type="button" className="vehicle-studio-panel-launch" aria-expanded={false} aria-controls="vehicle-studio-tab-panel" onClick={() => setPanelOpen(true)}>OPEN {tab === "performance" ? "UPGRADES" : selected.label}</button>}
      </div>

      <div className="vehicle-studio-rotate-hint" aria-hidden="true">
        <span>↔</span> DRAG TO ROTATE
      </div>
      {showDock && <footer className="vehicle-studio-dock" aria-label="Paint presets">
        <div className="vehicle-studio-dock-actions">{footer}</div>
      </footer>}
    </div>
  );
}
