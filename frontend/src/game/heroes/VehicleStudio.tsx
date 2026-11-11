import { useId, useState, type ReactNode } from "react";
import { MenuPanelHeading } from "../../components/menus/CollapsibleMenuPanel";
import type { VehicleStudioTab } from "./vehicleStudioStore";
import { getPerformanceReadouts, getVehicleStockPerformance, getVehicleTuningLimits, type VehiclePerformanceSummary } from "./vehiclePerformance";

import { VehicleGarageIcon } from "./VehicleGarageIcon";
import { VehicleDrivetrainSummary } from "./VehicleDrivetrainSummary";
import { VehicleUpgradeProgress } from "./VehicleMods";
import { drivetrainProfileFor } from "./vehicleDrivetrainOptions";
import { vehicleSystems } from "../../vehicles/vehicleSystems";

export const VEHICLE_STUDIO_TABS = [
  { id: "abilities", label: "ABILITIES", description: "Weapons and abilities for this vehicle" },
  { id: "performance", label: "PERFORMANCE", description: "Power, drivetrain and handling" },
  { id: "paint", label: "APPEARANCE", description: "Color, glass and finish" },
  { id: "body", label: "BODY", description: "Doors, panels and glass" },
  { id: "lighting", label: "LIGHTING", description: "Headlights, signals and lamps" },
  { id: "studio", label: "PORTRAIT", description: "Preview the current look" },
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
  type Panel = VehicleStudioTab | "stats" | "drivetrain";
  const [collapsedPanels, setCollapsedPanels] = useState<Partial<Record<Panel, boolean>>>({});
  const collapsed = Boolean(collapsedPanels[tab]);
  const toggle = (panel: Panel) => setCollapsedPanels(previous => ({ ...previous, [panel]: !previous[panel] }));
  const contentId = useId();

  if (tab === "abilities") {
    return <div className="vehicle-studio vehicle-studio--abilities" id="vehicle-studio-tab-panel" role="tabpanel"
      aria-labelledby="vehicle-studio-tab-abilities">{children}</div>;
  }

  const rows = getPerformanceReadouts(summary, speedUnit, vehicleId);
  const selected = VEHICLE_STUDIO_TABS.find((item) => item.id === tab)!;
  const limits = getVehicleTuningLimits(vehicleId);
  const systems = vehicleSystems(vehicleId);
  const marine = systems === "marine";
  const drivetrainTitle = marine ? "Propulsion" : "Drivetrain";
  const stage = (id: string) => Math.max(0, Math.min(limits.maxStage, stages[id] ?? 0));
  const keys = marine ? [["engine_force", "max_speed"], ["hull_hp", "mass"], ["length", "beam"]]
    : [["engine_force", "max_speed"], ["acceleration", "quarter_mile"], ["mu_base", "brake_force"]];
  const pairs: GarageStat[][] = keys.map(pair =>
    rows.filter(row => pair.includes(row.key)).sort((a, b) => pair.indexOf(a.key) - pair.indexOf(b.key))
  ).filter(pair => pair.length > 0);
  const stockCooling = getVehicleStockPerformance(vehicleId).cooling_multiplier ?? 1;
  const coolingBonus = Math.round(((summary.cooling_multiplier ?? stockCooling) / stockCooling - 1) * 100);
  pairs.push([
    ...(systems === "road" ? [{ key: "nitrous", label: "NITROUS", valueText: stage("nitrous") ? `STAGE ${stage("nitrous")}` : "STOCK", ratio: stage("nitrous") / limits.maxStage * 1.25, title: "Selected nitrous upgrade stage" }] : []),
    { key: "intercooler", label: "COOLING", valueText: coolingBonus ? `+${coolingBonus}%` : "STOCK", ratio: 1 + coolingBonus / 100, title: "Cooling capacity relative to stock" },
  ]);
  const panelTitle = tab === "performance" ? "Upgrades" : selected.label.toLowerCase();

  return (
    <div className="vehicle-studio">
      <div className="vehicle-studio-main">
        <aside className="vehicle-studio-details" aria-label="Vehicle details and performance"
          onFocus={event => (event.target as HTMLElement).scrollIntoView?.({ block: "nearest", inline: "nearest" })}>
          <section className="vehicle-studio-baseline menu-panel-frame" data-collapsed={Boolean(collapsedPanels.stats)} aria-label="Stats">
            <MenuPanelHeading title="Stats" contentId={contentId + "-stats"} collapsed={Boolean(collapsedPanels.stats)} toggle={() => toggle("stats")} />
            <div id={contentId + "-stats"} className="vehicle-studio-panel-content" hidden={collapsedPanels.stats}>
              <header className="vehicle-studio-identity">
                <h2>{name}</h2>
                <p><strong>{role.toUpperCase()}</strong> · {note}</p>
              </header>
              <div className="vehicle-studio-power" aria-label="Vehicle performance statistics">
                {pairs.map(pair => <div className="vehicle-studio-stat-pair" key={pair[0].key} data-count={pair.length}>
                  {pair.map(row => <GarageStatCell key={row.key} row={row} />)}
                </div>)}
              </div>
            </div>
          </section>
          <section className="vehicle-studio-drivetrain menu-panel-frame" data-collapsed={Boolean(collapsedPanels.drivetrain)} aria-label={drivetrainTitle}>
            <MenuPanelHeading title={drivetrainTitle} contentId={contentId + "-drivetrain"}
              collapsed={Boolean(collapsedPanels.drivetrain)} toggle={() => toggle("drivetrain")}>
              <small>{drivetrainProfileFor(vehicleId).driveLayout}</small>
            </MenuPanelHeading>
            <div id={contentId + "-drivetrain"} className="vehicle-studio-panel-content" hidden={collapsedPanels.drivetrain}>
              <VehicleDrivetrainSummary vehicle={vehicleId} weight={rows.find(row => row.key === "mass")?.valueText ?? "—"} economy={rows.find(row => row.key === "fuel_economy")?.valueText}
                suspension={stage("suspension")} damping={summary.suspension_damping_ratio} yawDamping={summary.angular_damping} />
            </div>
          </section>
        </aside>

        <section
          className="vehicle-studio-panel menu-panel-frame"
          data-collapsed={collapsed}
          role="tabpanel"
          id="vehicle-studio-tab-panel"
          aria-labelledby={"vehicle-studio-tab-" + tab}
        >
          <MenuPanelHeading title={panelTitle} contentId={contentId} collapsed={collapsed} toggle={() => toggle(tab)}>
            {tab === "performance" && <VehicleUpgradeProgress vehicle={vehicleId} stages={stages} maxStage={limits.maxStage} />}
          </MenuPanelHeading>
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
