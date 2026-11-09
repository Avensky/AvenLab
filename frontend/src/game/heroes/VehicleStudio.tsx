import { useEffect, useId, useState, type ReactNode } from "react";
import { useVehicleStudioStore, type VehicleStudioTab } from "./vehicleStudioStore";
import { getPerformanceReadouts, getVehicleStockPerformance, getVehicleTuningLimits, type VehiclePerformanceSummary } from "./vehiclePerformance";

import { VehicleGarageIcon } from "./VehicleGarageIcon";
import { VehicleDrivetrainSummary } from "./VehicleDrivetrainSummary";
import { VehicleUpgradeProgress } from "./VehicleMods";

export const VEHICLE_STUDIO_TABS = [
  { id: "abilities", label: "ABILITIES", description: "Weapons and abilities for this vehicle" },
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
    abilities:"M13 2 4 14h7l-1 8 10-12h-7l1-8Z",
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
  const [collapsedTabs, setCollapsedTabs] = useState<Partial<Record<VehicleStudioTab, boolean>>>({});
  const collapsed = Boolean(collapsedTabs[tab]);
  const contentId = useId();
  useEffect(() => {
    setActiveTab(tab);
  }, [setActiveTab, tab]);
  useEffect(() => () => setActiveTab(null), [setActiveTab]);

  if (tab === "abilities") {
    return <div className="hero-guide-scroll" id="vehicle-studio-tab-panel" role="tabpanel"
      aria-labelledby="vehicle-studio-tab-abilities" tabIndex={0}>{children}</div>;
  }

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
  const panelTitle = tab === "performance" ? "Upgrades" : selected.label.toLowerCase();

  return (
    <div className="vehicle-studio">
      <div className="vehicle-studio-main">
        <aside className="vehicle-studio-details" aria-label="Vehicle details and performance">
          <div className="vehicle-studio-baseline menu-panel-frame">
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
          className="vehicle-studio-panel menu-panel-frame"
          data-collapsed={collapsed}
          role="tabpanel"
          id="vehicle-studio-tab-panel"
          aria-labelledby={"vehicle-studio-tab-" + tab}
        >
          <header className="vehicle-studio-panel-heading" data-controller-row>
            <h2>{panelTitle}</h2>
            {tab === "performance" && <VehicleUpgradeProgress stages={stages} maxStage={limits.maxStage} />}
            <button type="button" className="vehicle-studio-panel-toggle"
              aria-label={`${collapsed ? "Expand" : "Minimize"} ${panelTitle.toLowerCase()}`}
              aria-expanded={!collapsed} aria-controls={contentId}
              onClick={() => setCollapsedTabs(previous => ({ ...previous, [tab]: !previous[tab] }))}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
                <path d={collapsed ? "M12 5v14M5 12h14" : "M5 12h14"} />
              </svg>
            </button>
          </header>
          <div id={contentId} hidden={collapsed} className="vehicle-studio-panel-content" data-controller-row data-controller-columns="1"
            onFocus={event => (event.target as HTMLElement).scrollIntoView?.({ block: "nearest", inline: "nearest" })}>
            {children}
          </div>
          {!collapsed && footer && <div className="vehicle-studio-panel-actions" data-controller-row>{footer}</div>}
        </section>
      </div>

      <div className="vehicle-studio-rotate-hint" aria-hidden="true">
        <span>↔</span> DRAG TO ROTATE
      </div>
    </div>
  );
}
