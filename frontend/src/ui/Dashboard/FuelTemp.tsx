import {ResourceFlags} from '../../store/telemetry/resourceMasks';
import { memo } from "react";
import type { GaugeConfig } from "../../store/session/vehicleConfigStore";
import FuelGauge from "./FuelGauge";
import TempGauge from "./TempGauge";
import { GaugeDisc } from "./Gauge";
import { ResourceLights } from "./InstrumentLights";
import type { DisplayPower } from "./dashboardModel";
import { ResourceRing } from "./ResourceRings";

export default memo(function FuelTemp({
  fuel,
  temp,
  config,
  clusterMask,
  resourceMask,
  power,
  absEnabled,
  tcsEnabled,
  live,
  cockpitMask,
  ultimate,
  ultimateActive,
}: {
  fuel: number | null;
  temp: number | null;
  config: GaugeConfig;
  clusterMask: number | null;
  resourceMask: number;
  power: DisplayPower;
  absEnabled: boolean;
  tcsEnabled: boolean;
  live: boolean;
  cockpitMask: number | null;
  ultimate: number | null;
  ultimateActive: boolean;
}) {
  return (
    <div
      className="fuel-temp-wrapper"
      role="group"
      aria-label="Fuel and temperature"
    >
      <svg viewBox="0 0 200 200">
        <GaugeDisc />
        <FuelGauge
          fuel={fuel}
          capacity={config.fuelCapacityLiters}
          power={power}
        />
        <TempGauge
          temp={temp}
          min={config.minTempC}
          overheat={config.overheatC}
          critical={config.criticalC}
          power={power}
        />
        {live&&(resourceMask&ResourceFlags.THERMAL_RECOVERY)!==0&&<text className="engine-thermal-notice" x="100" y="104" textAnchor="middle" fill="#e5b15d" fontSize="8" aria-label="Engine heat recovery">{power==='running'?'LIMP HOME':temp!==null&&temp>=config.overheatC?'COOLING':'RESTART READY'}</text>}
      </svg>
      <ResourceLights
        mask={clusterMask}
        fields={config.clusterFields}
        resourceMask={resourceMask}
        power={power}
        absEnabled={absEnabled}
        tcsEnabled={tcsEnabled}
        live={live}
        cockpitMask={cockpitMask}
      />
      <ResourceRing kind="hero" fraction={ultimate} active={ultimateActive} />
    </div>
  );
});
