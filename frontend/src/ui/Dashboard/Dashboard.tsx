import { useEffect } from "react";
import { startVehicleTelemetry, useVehicleTelemetryStore } from "../../store/vehicleTelemetryStore";
import { usePreferencesStore } from "../../store/preferencesStore";
import Speedometer from "./Speedometer";
import Revolutions from "./Revolutions";
import FuelTemp from "./FuelTemp";
import { ResourceFlags } from "../../store/tools/resourceMasks";
import { MPH_TO_KPH } from "./gaugeGeometry";
import { displayPower } from "./dashboardModel";
import { ResourceRing } from "./ResourceRings";
import "./dashboard.css";

export default function Dashboard() {
  const data = useVehicleTelemetryStore(s => s.data);
  const units = usePreferencesStore(s => s.speedUnit);
  useEffect(startVehicleTelemetry, []);
  const unit = units === "mph" ? "MPH" : "KM/H";
  const speed = data.speedKph === null ? null : units === "mph" ? data.speedKph / MPH_TO_KPH : data.speedKph;
  const power = displayPower(data);
  const park = data.cockpitMask !== null && Boolean(data.cockpitMask & (1 << 6)) && ((data.cockpitMask >>> 7) & 15) === 8;
  const warning = data.resourceMask & ResourceFlags.STARVED ? "FUEL EMPTY" : data.resourceMask & ResourceFlags.HEAT_LOCK ? "COOL ENGINE"
    : data.resourceMask & ResourceFlags.HOT ? "ENGINE HOT" : data.resourceMask & ResourceFlags.LOW_FUEL ? "LOW FUEL" : data.resourceMask & ResourceFlags.DAMAGED ? "REPAIR" : data.resourceMask & ResourceFlags.STARTING ? "STARTING" : "";
  return <section className="driving-dashboard" data-signal={data.signal} aria-label="Vehicle instruments">
    <span className="dashboard-signal" role="status">{data.signal === "live" ? warning : data.signal === "offline" ? "LINK LOST" : data.signal === "stale" ? "NO SIGNAL" : "WAITING"}</span>
    <div className="dashboard-cluster">
      <div className="dashboard-speed"><Speedometer speedKph={data.speedKph} unit={unit} clusterMask={data.clusterMask} clusterFields={data.config.clusterFields} />
        <ResourceRing kind="speed" fraction={data.conditionFraction} /></div>
      <div className="dashboard-rpm">
        <Revolutions rpm={data.rpm} gear={data.gear} maxRpm={data.config.maxRpm} redlineRpm={data.config.redlineRpm}
          speed={speed} unit={unit} power={power} vehicleMask={data.vehicleMask} clusterMask={data.clusterMask} park={park} />
        <ResourceRing kind="rpm" fraction={data.boostFraction} active={data.boostActive} />
      </div>
      <FuelTemp fuel={data.fuelLiters} temp={data.tempC} config={data.config} clusterMask={data.clusterMask}
        resourceMask={data.resourceMask} power={power} absEnabled={data.absEnabled} tcsEnabled={data.tcsEnabled} live={data.signal === "live"} cockpitMask={data.cockpitMask} ultimate={data.ultimateFraction} />
    </div>
  </section>;
}
