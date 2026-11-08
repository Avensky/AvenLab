import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import catalog from "../../../../avenlab-server/src/assets/vehicle-mods.json";
import type { VehiclePerformanceSummary } from "./VehicleStudio";
import { useVehicleStudioStore } from "./vehicleStudioStore";
import { drivetrainProfileFor } from "./vehicleDrivetrainOptions";
import { getVehicleStockPerformance, getVehicleTuningLimits } from "./vehiclePerformance";

function UpgradeIcon({ id }: { id: string }) {
  const path = id.includes("engine") ? "M3 9h3l2-3h8l2 3h3v8h-3l-2 3H8l-2-3H3zM8 9v2m8-2v2"
    : id.includes("transmission") ? "M6 3v5m0 4v9m6-18v4m0 4v10m6-18v5m0 4v9M6 8h12m-12 3h12"
    : id.includes("tire") ? "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 4a5 5 0 1 0 0 10 5 5 0 0 0 0-10Z"
    : id.includes("suspension") ? "M7 3 5 7l4 3-4 4 4 3-2 4m10-18 2 4-4 3 4 4-4 3 2 4"
    : id.includes("brake") ? "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 4v5l4 2M4 9h2m12 0h2m-14 6h2m12 0h2"
    : id.includes("armor") ? "M12 3 20 6v5c0 5-3 8-8 10-5-2-8-5-8-10V6zM9 12l2 2 4-5"
    : id.includes("fuel") ? "M6 3h9v18H6zM8 6h5v5H8zM15 8h2l3 3v6h-5"
    : "M4 7h16M4 12h16M4 17h16M8 5v4M16 10v4M10 15v4";
  return <span className="vehicle-upgrade-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d={path}/></svg></span>;
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
    <section className="vehicle-studio-card vehicle-performance-page" aria-label="Performance modifications">
      <header><small>{limits.className} CHASSIS · STOCK PHYSICS</small><h3>Performance parts</h3></header>
      <p>{limits.className} · MAX STAGE {limits.maxStage}</p>

      <section className="vehicle-drivetrain-card" aria-label="Drivetrain and transmission preview">
        <header><small>VEHICLE-SPECIFIC CONFIGURATION</small><h3>{profile.driveLayout} · TRANSMISSION</h3></header>
        {profile.transmissions.length > 0 ? (
          <>
            <div className="vehicle-drivetrain-modes" role="group" aria-label="Transmission mode">
              <button
                type="button"
                disabled={!profile.transmissions.includes("manual")}
                aria-pressed={selectedTransmission === "manual"}
                onClick={() => setTransmission(vehicle, "manual")}
              >MANUAL · H-PATTERN</button>
              <button
                type="button"
                disabled={!profile.transmissions.includes("automatic")}
                aria-pressed={selectedTransmission === "automatic"}
                onClick={() => setTransmission(vehicle, "automatic")}
              >AUTOMATIC</button>
              <button
                type="button"
                disabled={!profile.paddleShifters}
                aria-pressed={profile.paddleShifters && paddlesEnabled}
                onClick={() => setPaddlesEnabled((value) => !value)}
              >PADDLE SHIFTERS</button>
            </div>
           </>
        ) : (
          <p>Dedicated propulsion controls for this vehicle class.</p>
        )}
      </section>

      {Object.entries(catalog).map(([id, part]) => {
        const stage = Math.min(limits.maxStage, stages[id] ?? 0);
        return (
          <label className="vehicle-upgrade-row" key={id}>
            <UpgradeIcon id={id} />
            <span className="vehicle-upgrade-copy">
              <span className="vehicle-upgrade-line">
                <span className="vehicle-upgrade-name">{part.label}</span>
                <select
                  className="vehicle-upgrade-select"
                  aria-label={part.label}
                  value={stage}
                  onChange={(event) => onStagesChange({ ...stages, [id]: Number(event.target.value) })}
                >
                  {["Stock", "Street · Stage 1", "Sport · Stage 2", "Race · Stage 3"].slice(0, limits.maxStage + 1).map((label, index) => (
                    <option key={index} value={index}>{label}</option>
                  ))}
                </select>
              </span>
              <span className="vehicle-upgrade-segments" aria-hidden="true">
                {[0, 1, 2].map((index) => <i key={index} data-active={index < stage} data-available={index < limits.maxStage} />)}
              </span>
            </span>
          </label>
        );
      })}


    </section>
  );
}
