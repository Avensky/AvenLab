import { memo, type CSSProperties } from "react";
import { ClusterFlags, clusterFlag } from "../../store/tools/clusterMasks";
import { VehicleFlags, hasFlag } from "../../store/tools/inputMasks";
import { ResourceFlags } from "../../store/tools/resourceMasks";
import { SPEED_LAMP_POSITIONS } from "./gaugeGeometry";
import type { DisplayPower } from "./dashboardModel";

const Lamp = memo(function Lamp({ name, asset, x, y, color, active, supported = true, blink = false }: {
  name: string; asset: string; x: number; y: number; color: string; active: boolean; supported?: boolean; blink?: boolean;
}) {
  return <span className="instrument-lamp" data-lamp={name} data-active={active} data-supported={supported} data-blink={blink && active}
    role="img" aria-label={`${name}: ${!supported ? "unavailable" : active ? "on" : "off"}`}
    style={{ left: `${x}%`, top: `${y}%`, color, "--lamp-icon": `url("/images/${asset}")` } as CSSProperties} />;
});

export const SpeedometerLights = memo(function SpeedometerLights({ mask, fields }: { mask: number | null; fields: number }) {
  const lamps = [
    ["High beam", "headlights2.svg", "#69b6ff", ClusterFlags.HIGH_BEAM],
    ["Two-door open", "door-open-coupe.svg", "#ff4e48", ClusterFlags.DOOR_OPEN],
    ["Cruise control", "cruise-control.svg", "#a8ef63", ClusterFlags.CRUISE_ON],
    ["Low tire pressure", "tire-pressure.svg", "#ffb94c", ClusterFlags.TIRE_PRESSURE_LOW],
  ] as const;
  return <div className="speedometer-lights" aria-label="Speedometer telltales">
    {lamps.map(([name, asset, color, flag], index) => <Lamp key={name} name={name} asset={asset} color={color}
      x={SPEED_LAMP_POSITIONS[index].x / 2} y={SPEED_LAMP_POSITIONS[index].y / 2}
      active={Boolean(fields & flag) && clusterFlag(mask, flag)} supported={mask !== null && Boolean(fields & flag)} />)}
  </div>;
});

export const RpmLights = memo(function RpmLights({ vehicleMask, clusterMask }: { vehicleMask: number; clusterMask: number | null }) {
  const hazards = hasFlag(vehicleMask, VehicleFlags.HAZARDS);
  return <div className="rpm-lights" aria-label="RPM telltales">
    <Lamp name="Hazards" asset="hazard-triangle.svg" color="#ff5248" x={50} y={34} active={hazards} blink />
    <span className="traction-activity" data-lamp="Traction intervention" role="img"
      aria-label={`Traction intervention: ${clusterMask === null ? "unavailable" : clusterFlag(clusterMask, ClusterFlags.TRACTION_ACTIVE) ? "on" : "off"}`}
      data-active={clusterFlag(clusterMask, ClusterFlags.TRACTION_ACTIVE)} />
    <span className="gauge-turn gauge-turn-left" data-active={hazards || hasFlag(vehicleMask, VehicleFlags.BLINKER_LEFT)} aria-hidden="true">◀</span>
    <span className="gauge-turn gauge-turn-right" data-active={hazards || hasFlag(vehicleMask, VehicleFlags.BLINKER_RIGHT)} aria-hidden="true">▶</span>
  </div>;
});

export const ResourceLights = memo(function ResourceLights({ mask, fields, resourceMask, power, absEnabled, tcsEnabled, live, cockpitMask }: {
  mask: number | null; fields: number; resourceMask: number; power: DisplayPower; absEnabled: boolean; tcsEnabled: boolean; live: boolean;
  cockpitMask: number | null;
}) {
  const checking = power === "cranking";
  const state = (flag: number) => Boolean(fields & flag) && clusterFlag(mask, flag);
  const supplied = (flag: number) => mask !== null && Boolean(fields & flag);
  const brake = state(ClusterFlags.PARK_BRAKE);
  const assist = cockpitMask === null ? 0 : (cockpitMask >>> 4) & 3;
  return <div className="resource-lights" aria-label="Fuel and temperature telltales">
    <span className="gauge-brake" data-active={brake}>BRAKE</span>
    <Lamp name="Seatbelt" asset="seatBelt.svg" x={24} y={28} color="#ff4e48" active={state(ClusterFlags.SEATBELT)} supported={supplied(ClusterFlags.SEATBELT)} />
    <Lamp name="Battery warning" asset="car-battery.svg" x={24} y={41} color="#ff4e48" active={checking || state(ClusterFlags.LOW_BATTERY)} supported={checking || supplied(ClusterFlags.LOW_BATTERY)} blink={checking} />
    <Lamp name="Oil pressure warning" asset="car-oil.svg" x={24} y={54} color="#ff4e48" active={checking || state(ClusterFlags.LOW_OIL)} supported={checking || supplied(ClusterFlags.LOW_OIL)} blink={checking} />
    <Lamp name="Check engine" asset="engine.svg" x={24} y={67} color="#ffb94c" active={checking || state(ClusterFlags.ENGINE_WARNING)} supported={checking || supplied(ClusterFlags.ENGINE_WARNING)} blink={checking} />
    <span className="gauge-abs-warning" data-active={checking || (live && !absEnabled)}>ABS</span>
    <span className="gauge-tcs-warning" data-active={live && !tcsEnabled}>TRAC OFF</span>
    <span className="gauge-vsc-warning" data-active={live && (assist === 1 || assist === 3)}>{assist === 3 ? "VSC OFF" : "VSC SPORT"}</span>
    <Lamp name="Steering warning" asset="steering-warning.svg" x={80} y={50} color="#ffb94c" active={state(ClusterFlags.EPS_WARNING)} supported={supplied(ClusterFlags.EPS_WARNING)} />
    <Lamp name="Low fuel" asset="gas-station-low.svg" x={91} y={50} color="#ffb94c"
      active={state(ClusterFlags.LOW_FUEL) || (resourceMask & (ResourceFlags.LOW_FUEL | ResourceFlags.STARVED)) !== 0} supported={live} />
  </div>;
});
