import type { SpotLight } from "three";

const lowBeams = new WeakMap<
  SpotLight,
  { intensity: number; distance: number; y: number }
>();

/** Mutate existing lamps inside the model's existing frame callback. Snapshot
 * high beams affect every car, including remote opponents, with no new lights. */
export function applyHeadlightBeam(
  light: SpotLight | null,
  enabled: boolean,
  high: boolean,
) {
  if (!light) return;
  let low = lowBeams.get(light);
  if (!low) {
    low = {
      intensity: light.intensity,
      distance: light.distance,
      y: light.target.position.y,
    };
    lowBeams.set(light, low);
  }
  light.visible = enabled;
  light.intensity = low.intensity * (high ? 1.8 : 1);
  light.distance = low.distance * (high ? 1.5 : 1);
  light.target.position.y = high ? light.position.y + 0.05 : low.y;
}
