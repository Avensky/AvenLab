import type { CSSProperties } from "react";
import { useUIStore } from "../../../store/menus/uiStore";
import { WheelArtwork } from "../WheelArtwork";
import {
  STALK_LAYOUTS,
  stalkPoint,
  stalkStepAngle,
  stalkTangent,
} from "../stalks/geometry";

export type SteeringSystem = "lights" | "wipers" | "cruise";
const systems = [
  { id: "lights", label: "Lights", asset: "headlights.svg" },
  { id: "wipers", label: "Wipers", asset: "windshield-wiper.svg" },
  { id: "cruise", label: "Cruise", asset: "cruise-control.svg" },
] as const;

/** A navigation view of the real wheel geometry. Each complete lever is one
 * page-selection target, never a vehicle input. The shared layout catalog keeps
 * its positions consistent with the three working levers on the driving HUD. */
export function SteeringSystemPicker({
  selected,
}: {
  selected: SteeringSystem;
}) {
  return (
    <nav className="cockpit-wheel-picker" aria-label="Steering column systems">
      <WheelArtwork />
      {systems.map(({ id, label, asset }) => {
        const layout = STALK_LAYOUTS[id];
        return (
          <div
            key={id}
            className="picker-stalk"
            data-system={id}
            data-selected={selected === id}
          >
            <span
              className="picker-rod"
              aria-hidden="true"
              style={
                {
                  width: `${layout.reach}%`,
                  "--picker-angle": `${-layout.angle}deg`,
                } as CSSProperties
              }
            />
            {([-1, 1] as const).map((direction) => {
              const angle = stalkStepAngle(
                layout.angle,
                direction,
                layout.spacing,
              );
              return (
                <span
                  key={direction}
                  className="picker-neighbor"
                  aria-hidden="true"
                  style={{
                    ...stalkPoint(angle, layout.reach),
                    transform: `translate(-50%,-50%) rotate(${stalkTangent(angle)}deg)`,
                  }}
                />
              );
            })}
            <button
              type="button"
              aria-label={`Select ${id} stalk`}
              aria-current={selected === id ? "page" : undefined}
              style={stalkPoint(layout.angle, layout.reach)}
              onClick={() => useUIStore.getState().setCockpitTab(id)}
            >
              <span
                className="picker-cap"
                style={{
                  transform: `rotate(${stalkTangent(layout.angle)}deg)`,
                }}
              >
                <img src={`/images/${asset}`} alt="" />
              </span>
            </button>
            <span
              className="picker-label"
              aria-hidden="true"
              style={stalkPoint(layout.angle, layout.reach + 14)}
            >
              {label}
            </span>
          </div>
        );
      })}
    </nav>
  );
}
