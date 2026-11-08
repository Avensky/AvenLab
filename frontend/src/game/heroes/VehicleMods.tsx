import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import catalog from "../../../../avenlab-server/src/assets/vehicle-mods.json";
import type { VehiclePerformanceSummary } from "./VehicleStudio";
import { useVehicleStudioStore } from "./vehicleStudioStore";
import { drivetrainProfileFor } from "./vehicleDrivetrainOptions";
import { getVehicleStockPerformance, getVehicleTuningLimits } from "./vehiclePerformance";

import { VehicleGarageIcon } from "./VehicleGarageIcon";

const POWER_PARTS = new Set(["turbo", "nitrous", "exhaust", "intercooler"]);
const PART_LABELS: Record<string, string> = { tires: "TIRES", turbo: "TURBO", nitrous: "NITROUS", exhaust: "EXHAUST", suspension: "SUSPENSION", brakes: "BRAKES", gearing: "GEARING", weight: "WEIGHT", intercooler: "INTERCOOLER" };

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
  const stock = useMemo(() => getVehicleStockPerformance(vehicle), [vehicle]);
  const limits = useMemo(() => getVehicleTuningLimits(vehicle), [vehicle]);
  const effects = useMemo(() => {
    const next: Record<string, number> = {};
    for (const [id, part] of Object.entries(catalog))
      for (const [stat, amount] of Object.entries(part.effects))
        next[stat] = (next[stat] ?? 1) + amount * Math.min(limits.maxStage, stages[id] ?? 0);
    return next;
  }, [limits.maxStage, stages]);

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
        {["power", "chassis"].map(group => <button type="button" key={group} aria-pressed={upgradeGroup === group} onClick={() => setUpgradeGroup(group)}>{group.toUpperCase()}</button>)}
      </div>
      {Object.entries(catalog).map(([id, part]) => {
        const stage = Math.max(0, Math.min(limits.maxStage, stages[id] ?? 0));
        return <div className="vehicle-upgrade-row" key={id} data-upgrade-group={POWER_PARTS.has(id) ? "power" : "chassis"} role="group" aria-labelledby={`upgrade-label-${id}`}>
          <VehicleGarageIcon name={id} />
          <span className="vehicle-upgrade-name" id={`upgrade-label-${id}`}>{PART_LABELS[id] ?? part.label}</span>
          <div className="vehicle-upgrade-stepper">
            <button type="button" aria-label={`Downgrade ${part.label}`} disabled={stage === 0} onClick={() => onStagesChange({ ...stages, [id]: stage - 1 })}>−</button>
            <output aria-live="polite" aria-label={`${part.label} stage`}>{stage ? `STAGE ${stage}` : "STOCK"}</output>
            <button type="button" aria-label={`Upgrade ${part.label}`} disabled={stage >= limits.maxStage} onClick={() => onStagesChange({ ...stages, [id]: stage + 1 })}>+</button>
          </div>
          <span className="vehicle-upgrade-segments" aria-hidden="true">{[0, 1, 2].map(index => <i key={index} data-active={index < stage} data-available={index < limits.maxStage} />)}</span>
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
