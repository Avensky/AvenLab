import { memo } from "react";
import type { GaugeConfig } from "../../store/vehicleConfigStore";
import FuelGauge from "./FuelGauge";
import TempGauge from "./TempGauge";
import { Hub } from "./Gauge";
import { RepairGauge } from "./RepairGauge";

export default memo(function FuelTemp({ fuel, temp, condition, config }: { fuel: number | null; temp: number | null; condition: number | null; config: GaugeConfig }) {
  return <div className="fuel-temp-wrapper" role="group" aria-label="Fuel and temperature">
    <svg viewBox="0 0 160 160">
      <circle cx="80" cy="80" r="78" className="gauge-disc" />
      <FuelGauge fuel={fuel} capacity={config.fuelCapacityLiters} />
      <TempGauge temp={temp} min={config.minTempC} overheat={config.overheatC} critical={config.criticalC} />
      <Hub x={60} y={80} />
    </svg>
    <RepairGauge condition={condition} />
  </div>;
});
