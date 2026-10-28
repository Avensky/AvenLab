import { useEffect } from "react";
import { startVehicleTelemetry, useVehicleTelemetryStore } from "../../store/vehicleTelemetryStore";
import { usePreferencesStore } from "../../store/preferencesStore";
import Speedometer from "./Speedometer";
import Revolutions from "./Revolutions";
import FuelTemp from "./FuelTemp";
import { Boost } from "./Boost";
import { AssistLights } from "./AssistLights";
import { ResourceFlags } from "../../store/tools/resourceMasks";
import "./dashboard.css";

export default function Dashboard() {
  const data = useVehicleTelemetryStore(s => s.data);
  const units = usePreferencesStore(s => s.speedUnit);
  useEffect(startVehicleTelemetry, []);
  const factor = units === "mph" ? 0.6213711922 : 1, unit = units === "mph" ? "MPH" : "KM/H";
  const max = units === "mph" ? Math.ceil(data.config.speedMaxKph * factor / 40) * 40 : data.config.speedMaxKph;
  const warning = data.resourceMask & ResourceFlags.STARVED ? "FUEL EMPTY" : data.resourceMask & ResourceFlags.HEAT_LOCK ? "COOL ENGINE"
    : data.resourceMask & ResourceFlags.HOT ? "ENGINE HOT" : data.resourceMask & ResourceFlags.LOW_FUEL ? "LOW FUEL" : data.resourceMask & ResourceFlags.DAMAGED ? "REPAIR" : data.resourceMask & ResourceFlags.STARTING ? "STARTING" : "";
  return <section className="driving-dashboard" data-signal={data.signal} aria-label="Vehicle instruments">
    <div className="dashboard-heading"><div><span>{data.vehicleId}</span><span className="dashboard-signal" role="status">{data.signal === "live" ? warning : data.signal === "offline" ? "LINK LOST" : data.signal === "stale" ? "NO SIGNAL" : "WAITING"}</span></div><AssistLights abs={data.absEnabled} tcs={data.tcsEnabled} live={data.signal === "live"} /></div>
    <div className="dashboard-cluster">
      <Speedometer speed={data.speedKph === null ? null : data.speedKph * factor} maxSpeed={max} unit={unit} />
      <div className="dashboard-rpm">
        <Revolutions rpm={data.rpm} gear={data.gear} maxRpm={data.config.maxRpm} redlineRpm={data.config.redlineRpm} engineOn={data.engineOn} />
        <Boost fraction={data.boostFraction} active={data.boostActive} />
      </div>
      <FuelTemp fuel={data.fuelLiters} temp={data.tempC} condition={data.conditionFraction} config={data.config} />
    </div>
  </section>;
}
