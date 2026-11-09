import { drivetrainProfileFor } from "./vehicleDrivetrainOptions";
import { useVehicleStudioStore } from "./vehicleStudioStore";

// Axle positions mirror vehicle_setup.rs. This is a static estimate with the
// longitudinal center of mass at the chassis origin, not measured axle telemetry.
const AXLES: Record<string, readonly [number, number]> = {
  ae86: [1.27, -1.11], gt86: [1.365, -1.205], brz: [1.38, -1.22],
  cx30: [1.2449, -1.374], mini: [1.1682, -1.3197],
  fortuner: [1.4003, -1.3497], landcruiser: [1.5258, -1.3272],
  sierra: [2.0058, -1.703], camaro: [1.485, -1.325], supra: [1.239, -1.227],
  enforcer: [1.2426, -1.4379], interceptor: [1.3006, -1.3804],
  charger70: [1.6319, -1.2921], skyline34: [1.3365, -1.3011], timecar: [1.2727, -1.1613],
};

export function estimatedFrontWeightPercent(vehicle: string): number | null {
  const axles = AXLES[vehicle];
  return axles ? Math.round(-axles[1] / (axles[0] - axles[1]) * 100) : null;
}

export function VehicleDrivetrainDiagram({ layout }: { layout: string }) {
  const marine = layout === "TWIN SCREW";
  const tracked = layout === "TRACK DRIVE";
  const front = layout === "AWD" || layout === "4WD" || layout === "FWD" || tracked;
  const rear = layout === "AWD" || layout === "4WD" || layout === "RWD" || tracked;
  return <svg className="vehicle-drivetrain-diagram" viewBox="0 0 90 116" role="img" aria-label={`${layout} drivetrain diagram`}>
    <path className="chassis-outline" d="M24 8Q45 1 66 8L73 30v62l-7 17H24l-7-17V30Z" />
    {marine ? <g className="chassis-driven"><path d="M35 28v61m20-61v61" />{[35, 55].map(x => <g key={x}><circle cx={x} cy="92" r="7" /><path d={`M${x-5} 87l10 10m0-10-10 10`} /></g>)}</g> : <>
      <path className={front ? "chassis-driven" : "chassis-idle"} d="M20 30h50M45 30v22" />
      <path className={rear ? "chassis-driven" : "chassis-idle"} d="M20 86h50M45 62v24" />
      <rect className="chassis-engine" x="35" y="15" width="20" height="13" rx="3" />
      <rect className="chassis-driven" x="39" y="51" width="12" height="12" rx="3" />
      {tracked ? [9, 65].map(x => <rect key={x} className="chassis-driven chassis-track" x={x} y="18" width="16" height="81" rx="7" />) : [22, 78].flatMap((y, axle) => [9, 67].map(x => <g key={`${x}:${y}`} className={(axle === 0 ? front : rear) ? "chassis-driven" : "chassis-idle"}><rect x={x} y={y} width="14" height="25" rx="4" /><path d={`M${x+4} ${y+3}v19m3-19v19m3-19v19`} /></g>))}
      <circle className="chassis-joint" cx="45" cy="30" r="3" /><circle className="chassis-joint" cx="45" cy="86" r="3" />
    </>}
  </svg>;
}

export function VehicleDrivetrainSummary({ vehicle, weight, economy, suspension, damping }: {
  vehicle: string; weight: string; economy?: string; suspension: number; damping: number;
}) {
  const profile = drivetrainProfileFor(vehicle);
  const savedTransmission = useVehicleStudioStore(state => state.transmissions[vehicle]);
  const transmission = savedTransmission ?? profile.defaultTransmission;
  const front = estimatedFrontWeightPercent(vehicle);
  // The server powertrain uses six forward ratios for wheeled/tracked vehicles.
  const gearbox = profile.driveLayout === "TWIN SCREW" ? "DIRECT" : `${transmission === "manual" ? "MANUAL" : "AUTO"} · 6`;
  return <section className="vehicle-studio-drivetrain" aria-label="Drivetrain and chassis">
    <header><span>DRIVETRAIN</span><strong>{profile.driveLayout}</strong></header>
    <div className="vehicle-chassis-content">
      <VehicleDrivetrainDiagram layout={profile.driveLayout} />
      <dl>
        <div><dt>WEIGHT</dt><dd>{weight}</dd></div>
        <div title="Estimated front/rear static weight split from the configured axle positions"><dt>F/R SPLIT</dt><dd>{front === null ? "—" : `${front}:${100-front}`}</dd></div>
        <div><dt>GEARBOX</dt><dd>{gearbox}</dd></div>
        <div title={`Suspension damping ratio: ${damping.toFixed(2)}`}><dt>SUSPENSION</dt><dd>{["STOCK", "STREET", "SPORT", "RACE"][suspension] ?? "STOCK"}</dd></div>
        {economy && <div><dt>ECONOMY</dt><dd>{economy}</dd></div>}
      </dl>
    </div>
  </section>;
}
