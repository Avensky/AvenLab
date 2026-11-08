import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import catalog from "../../../../avenlab-server/src/assets/vehicle-mods.json";
import type { VehiclePerformanceSummary } from "./VehicleStudio";
import { useVehicleStudioStore } from "./vehicleStudioStore";
import { drivetrainProfileFor } from "./vehicleDrivetrainOptions";
import { getPerformanceReadouts, getVehicleStockPerformance, getVehicleTuningLimits } from "./vehiclePerformance";

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
  const readouts = getPerformanceReadouts(summary);

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
      <details className="vehicle-build-options">
        <summary>BUILD OPTIONS</summary>
        <div>
          <button type="button" onClick={restore}>RESTORE STOCK</button>
          <button type="button" onClick={exportBuild}>EXPORT BUILD</button>
        </div>
      </details>,
    );
    return () => onFooterChange?.(null);
  }, [onFooterChange, restore, exportBuild]);

  return (
    <section className="vehicle-studio-card vehicle-performance-page" aria-label="Performance modifications">
      <header><small>{limits.className} CHASSIS · STOCK PHYSICS</small><h3>Performance parts</h3></header>
      <p>Grades compare this configured chassis with a supercar benchmark. Fictional upgrades are capped by vehicle class and do not change driving physics yet.</p>

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
            <p>{profile.transmissions.length === 1
              ? "This chassis is configured for automatic modes only."
              : "Only transmission modes configured for this chassis can be selected."}</p>
          </>
        ) : (
          <p>Dedicated propulsion controls for this vehicle class.</p>
        )}
      </section>

      {Object.entries(catalog).map(([id, part]) => (
        <label key={id}>
          {part.label}
          <select
            aria-label={part.label}
            value={Math.min(limits.maxStage, stages[id] ?? 0)}
            onChange={(event) => onStagesChange({ ...stages, [id]: Number(event.target.value) })}
          >
            {["Stock", "Street · Stage 1", "Sport · Stage 2", "Race · Stage 3"].slice(0, limits.maxStage + 1).map((label, index) => (
              <option key={index} value={index}>{label}</option>
            ))}
          </select>
        </label>
      ))}

      <figure className="vehicle-performance-stats" aria-label="Configured vehicle performance compared with supercar benchmark">
        <figcaption className="sr-only">In-game values and chassis-specific supercar grades</figcaption>
        {readouts.map((row) => (
          <div className="vehicle-performance-stat" key={row.key}>
            <label>
              <span>{row.label}</span>
              <strong>{row.grade} · {row.valueText}</strong>
              <small>SUPERCAR {row.benchmarkText}</small>
              <meter min={0} max={1.25} value={row.ratio} optimum={1} aria-label={row.label + " grade " + row.grade + ", " + row.valueText + ", benchmark " + row.benchmarkText} />
            </label>
          </div>
        ))}
      </figure>
      <p className="vehicle-mod-limit-note">CHASSIS LIMIT · {limits.className} · STAGE {limits.maxStage} MAX</p>
    </section>
  );
}
