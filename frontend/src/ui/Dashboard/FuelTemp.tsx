import { memo } from "react";
import type { GaugeConfig } from "../../store/vehicleConfigStore";
import FuelGauge from "./FuelGauge";
import TempGauge from "./TempGauge";
import { GaugeDisc } from "./Gauge";
import { ResourceLights } from "./InstrumentLights";
import type { DisplayPower } from "./dashboardModel";
import { ResourceRing } from "./ResourceRings";

export default memo(function FuelTemp({ fuel, temp, config, clusterMask, resourceMask, power, absEnabled, tcsEnabled, live, cockpitMask, ultimate }: {
  fuel: number | null; temp: number | null; config: GaugeConfig; clusterMask: number | null; resourceMask: number;
  power: DisplayPower; absEnabled: boolean; tcsEnabled: boolean; live: boolean;
  cockpitMask: number | null;
  ultimate: number | null;
}) {
  return <div className="fuel-temp-wrapper" role="group" aria-label="Fuel and temperature">
    <svg viewBox="0 0 200 200">
      <GaugeDisc />
      <FuelGauge fuel={fuel} capacity={config.fuelCapacityLiters} power={power} />
      <TempGauge temp={temp} min={config.minTempC} overheat={config.overheatC} critical={config.criticalC} power={power} />
    </svg>
    <ResourceLights mask={clusterMask} fields={config.clusterFields} resourceMask={resourceMask} power={power} absEnabled={absEnabled} tcsEnabled={tcsEnabled} live={live} cockpitMask={cockpitMask} />
    <ResourceRing kind="hero" fraction={ultimate} />
  </div>;
});
