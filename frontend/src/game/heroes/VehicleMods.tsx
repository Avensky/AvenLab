import { useCallback, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import catalog from "../../../../avenlab-server/src/assets/vehicle-mods.json";
import type { VehiclePerformanceSummary } from "./vehiclePerformance";
import { useVehicleStudioStore } from "./vehicleStudioStore";
import { drivetrainProfileFor } from "./vehicleDrivetrainOptions";
import { getVehicleStockPerformance, getVehicleTuningLimits } from "./vehiclePerformance";
import { vehicleSystems } from "../../vehicles/vehicleSystems";

import { VehicleGarageIcon } from "./VehicleGarageIcon";

const PARTS = Object.entries(catalog);
const PARTS_BY_SYSTEM = {
  road: PARTS.filter(([,part]) => part.systems.includes("road")),
  tracked: PARTS.filter(([,part]) => part.systems.includes("tracked")),
  marine: PARTS.filter(([,part]) => part.systems.includes("marine")),
};

function upgradeStage(stages: Record<string, number>, id: string, maxStage: number) {
  return Math.max(0, Math.min(maxStage, stages[id] ?? 0));
}

function UpgradeBars({ value, max, label, bars = max }: { value: number; max: number; label: string; bars?: number }) {
  return (
    <span className="vehicle-upgrade-segments" role="meter" aria-label={label}
      aria-valuemin={0} aria-valuemax={max} aria-valuenow={value} title={`${value} / ${max} stages`}>
      {Array.from({ length: bars }, (_, index) => (
        <i key={index} aria-hidden="true" style={{
          "--bar-fill": `${Math.max(0, Math.min(1, value * bars / max - index)) * 100}%`,
        } as CSSProperties} />
      ))}
    </span>
  );
}

export function VehicleUpgradeProgress({ vehicle, stages, maxStage }: { vehicle: string; stages: Record<string, number>; maxStage: number }) {
  const parts = PARTS_BY_SYSTEM[vehicleSystems(vehicle)];
  const installed = parts.reduce((total, [id]) => total + upgradeStage(stages, id, maxStage), 0);
  return <UpgradeBars value={installed} max={parts.length * maxStage} bars={5} label="Installed upgrade stages" />;
}

export function VehicleMods({
  vehicle,
  stages,
  onStagesChange,
  onSummaryChange,
  onFooterChange,
}: {
  vehicle: string;
  stages: Record<string, number>;
  onStagesChange: (stages: Record<string, number>) => void;
  onSummaryChange?: (summary: VehiclePerformanceSummary) => void;
  onFooterChange?: (footer: ReactNode | null) => void;
}) {
  const [upgradeGroup, setUpgradeGroup] = useState("power");
  const systems = vehicleSystems(vehicle);
  const parts = PARTS_BY_SYSTEM[systems];
  const stock = useMemo(() => getVehicleStockPerformance(vehicle), [vehicle]);
  const limits = useMemo(() => getVehicleTuningLimits(vehicle), [vehicle]);
  const effects = useMemo(() => {
    const next: Record<string, number> = {};
    for (const [id, part] of parts)
      for (const [stat, amount] of Object.entries(part.effects))
        next[stat] = (next[stat] ?? 1) + amount * upgradeStage(stages, id, limits.maxStage);
    return next;
  }, [limits.maxStage, parts, stages]);

  const summary = useMemo(() => {
    const capped = {
      engine_force: Math.min(limits.engine, effects.engine_force ?? 1),
      max_speed: Math.min(limits.speed, effects.max_speed ?? 1),
      mu_base: Math.min(limits.grip, effects.mu_base ?? 1),
      brake_force: Math.min(limits.brakes, effects.brake_force ?? 1),
      suspension_damping_ratio: Math.min(limits.suspension, effects.suspension_damping_ratio ?? 1),
      mass: Math.max(limits.weight, effects.mass ?? 1),
    };
    return {
      engine_force: stock.engine_force * capped.engine_force,
      max_speed: stock.max_speed * capped.max_speed,
      mu_base: stock.mu_base * capped.mu_base,
      brake_force: stock.brake_force * capped.brake_force,
      suspension_damping_ratio: stock.suspension_damping_ratio * capped.suspension_damping_ratio,
      mass: stock.mass * capped.mass,
      cooling_multiplier: (stock.cooling_multiplier ?? 1) * Math.min(1 + limits.maxStage * 0.1, effects.cooling_multiplier ?? 1),
      angular_damping: stock.angular_damping === undefined ? undefined : stock.angular_damping * (effects.angular_damping ?? 1),
    };
  }, [effects, limits, stock]);

  const restore = useCallback(() => onStagesChange({}), [onStagesChange]);
  const exportBuild = useCallback(() => {
    const blob = new Blob([JSON.stringify({ vehicle, tuning: { mod_stages: stages } }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = vehicle + "-mods.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, [vehicle, stages]);

  const profile = drivetrainProfileFor(vehicle);
  const savedTransmission = useVehicleStudioStore((state) => state.transmissions[vehicle]);
  const setTransmission = useVehicleStudioStore((state) => state.setTransmission);
  const selectedTransmission = profile.defaultTransmission
    ? savedTransmission ?? profile.defaultTransmission
    : null;
  const [paddlesEnabled, setPaddlesEnabled] = useState(profile.paddleShifters);
  useEffect(() => {
    if (profile.defaultTransmission && !profile.transmissions.includes(selectedTransmission ?? profile.defaultTransmission))
      setTransmission(vehicle, profile.defaultTransmission);
    setPaddlesEnabled(profile.paddleShifters);
  }, [profile, selectedTransmission, setTransmission, vehicle]);

  useEffect(() => { onSummaryChange?.(summary); }, [summary, onSummaryChange]);
  useEffect(() => {
    onFooterChange?.(
      <>
        <button type="button" onClick={restore}>RESTORE STOCK</button>
        <button type="button" onClick={exportBuild}>EXPORT BUILD</button>
      </>,
    );
    return () => onFooterChange?.(null);
  }, [onFooterChange, restore, exportBuild]);

  return (
    <section className="vehicle-performance-page" aria-label="Performance modifications" data-upgrade-group={upgradeGroup}>
      <div className="vehicle-upgrade-limit">{limits.className} · MAX STAGE {limits.maxStage}</div>
      <div className="vehicle-upgrade-filter" role="group" aria-label="Upgrade categories">
        {["power", "chassis"].map((group,index) => <button type="button" key={group} aria-pressed={upgradeGroup === group} onClick={() => setUpgradeGroup(group)}>{(systems === "marine" ? ["propulsion", "hull"][index] : group).toUpperCase()}</button>)}
      </div>
      {parts.map(([id, part]) => {
        const stage = upgradeStage(stages, id, limits.maxStage);
        return <div className="vehicle-upgrade-row" key={id} data-upgrade-group={part.group} role="group" aria-labelledby={`upgrade-label-${id}`}>
          <VehicleGarageIcon name={id} />
          <span className="vehicle-upgrade-name" id={`upgrade-label-${id}`}>{part.short}</span>
          <div className="vehicle-upgrade-stepper">
            <button type="button" aria-label={`Downgrade ${part.label}`} disabled={stage === 0} onClick={() => onStagesChange({ ...stages, [id]: stage - 1 })}>−</button>
            <UpgradeBars value={stage} max={limits.maxStage} label={`${part.label} stage`} />
            <button type="button" aria-label={`Upgrade ${part.label}`} disabled={stage >= limits.maxStage} onClick={() => onStagesChange({ ...stages, [id]: stage + 1 })}>+</button>
          </div>
        </div>;
      })}
      {profile.transmissions.length > 0 && <div className="vehicle-gearbox-controls" role="group" aria-label="Gearbox configuration">
        <span><VehicleGarageIcon name="gearing" /> GEARBOX</span>
        <div className="vehicle-drivetrain-modes">
          {profile.transmissions.map(mode => <button key={mode} type="button" aria-pressed={selectedTransmission === mode} onClick={() => setTransmission(vehicle, mode)}>{mode === "manual" ? "MANUAL" : "AUTO"}</button>)}
          {profile.paddleShifters && <button type="button" aria-pressed={paddlesEnabled} onClick={() => setPaddlesEnabled(value => !value)}>PADDLES</button>}
        </div>
      </div>}
    </section>
  );
}
