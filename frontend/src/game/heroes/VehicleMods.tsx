import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import catalog from "../../../../avenlab-server/src/assets/vehicle-mods.json";
import type { VehiclePerformanceSummary } from "./VehicleStudio";
import { useVehicleStudioStore } from "./vehicleStudioStore";
import { drivetrainProfileFor } from "./vehicleDrivetrainOptions";

const names: Record<string, string> = {
  engine_force: "Engine force",
  max_speed: "Speed cap",
  mu_base: "Tire grip",
  brake_force: "Braking",
  mass: "Mass",
  suspension_damping_ratio: "Suspension damping",
};

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
  const effects = useMemo(() => {
    const next: Record<string, number> = {};
    for (const [id, part] of Object.entries(catalog))
      for (const [stat, amount] of Object.entries(part.effects))
        next[stat] = (next[stat] ?? 1) + amount * (stages[id] ?? 0);
    return next;
  }, [stages]);

  const summary = useMemo(() => {
    const engine = effects.engine_force ?? 1;
    const mass = effects.mass ?? 1;
    // UI estimate only until fuel use is part of the simulation's vehicle data.
    const fuel = Math.max(0.6, 1 + (engine - 1) * 0.45 + (mass - 1) * 0.2);
    return {
      engine_force: engine,
      max_speed: effects.max_speed ?? 1,
      mu_base: effects.mu_base ?? 1,
      brake_force: effects.brake_force ?? 1,
      suspension_damping_ratio: effects.suspension_damping_ratio ?? 1,
      fuel_consumption: fuel,
    };
  }, [effects]);

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
      <header><small>BUILD PREVIEW · STOCK = 100%</small><h3>Performance parts</h3></header>
      <p>Choose a stage to compare fictional upgrades. Tuning shown here is a build estimate and does not change driving physics yet.</p>

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
            value={stages[id] ?? 0}
            onChange={(event) => onStagesChange({ ...stages, [id]: Number(event.target.value) })}
          >
            {["Stock", "Street · Stage 1", "Sport · Stage 2", "Race · Stage 3"].map((label, index) => (
              <option key={index} value={index}>{label}</option>
            ))}
          </select>
        </label>
      ))}

      <figure className="vehicle-performance-stats" aria-label="Estimated stock-relative performance comparison">
        <figcaption className="sr-only">Estimated stat comparison, not a measured dyno run</figcaption>
        {Object.entries(effects).map(([stat, multiplier]) => (
          <div className="vehicle-performance-stat" key={stat}>
            <label>
              <span>{names[stat] ?? stat.replaceAll("_", " ")}</span>
              <strong>{(100 * multiplier).toFixed(1)}%</strong>
              <meter min={0} max={1.5} value={Math.max(0, Math.min(1.5, multiplier))} optimum={1} />
            </label>
          </div>
        ))}
      </figure>
    </section>
  );
}
