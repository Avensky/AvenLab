import type { MenuRow } from "../../components/menus/TabbedMenu";
import {
  DEFAULT_GARAGE_EFFECTS,
  type GarageEffects,
} from "../../store/preferences/garageEffects";

type NumberKey = {
  [K in keyof GarageEffects]: GarageEffects[K] extends number ? K : never;
}[keyof GarageEffects];
const cycle = (values: number[], value: number, dir = 1) =>
  values[
    (Math.max(0, values.indexOf(value)) + dir + values.length) % values.length
  ];

/** The shared menu row owner supplies click, arrows, controller and scrolling. */
export function garageSettingsRows(
  settings: GarageEffects,
  contrast: boolean,
  update: (patch: Partial<GarageEffects>) => void,
): MenuRow[] {
  const number = (
    key: NumberKey,
    label: string,
    values: number[],
    format: (value: number) => string,
    description?: string,
    disabled = false,
  ): MenuRow => ({
    id: `garage-${key}`,
    label,
    description,
    disabled,
    value: format(settings[key]),
    action: (dir) => update({ [key]: cycle(values, settings[key], dir) }),
  });
  const percent = (value: number) => `${Math.round(value * 100)}%`;
  const glowOff = contrast || !settings.bloom;
  return [
    {
      id: "garage-paint", label: "Showroom paint", value: settings.paint.replaceAll("-", " "),
      description: "Factory, hot pink or pastel pink preview for AE86, BRZ and Supra. Gameplay paint is unchanged.",
      action: (dir = 1) => { const paints = ["factory", "hot-pink", "pastel-pink"] as const;
        update({paint:paints[(paints.indexOf(settings.paint)+dir+paints.length)%paints.length]}); },
    },
    {
      id: "garage-bloom",
      label: "Bloom glow",
      value: contrast ? "Off · high contrast" : settings.bloom ? "On" : "Off",
      description:
        "Soft halos around bright garage fixtures. High contrast turns them off.",
      disabled: contrast,
      action: () => update({ bloom: !settings.bloom }),
    },
    number(
      "bloomStrength",
      "Glow strength",
      [0, 0.25, 0.5, 0.75, 1, 1.5],
      percent,
      undefined,
      glowOff,
    ),
    number(
      "bloomRadius",
      "Glow spread",
      [0, 0.15, 0.25, 0.5, 0.75, 1],
      percent,
      undefined,
      glowOff,
    ),
    number(
      "bloomThreshold",
      "Glow threshold",
      [0.5, 0.75, 1, 1.5, 2, 3],
      (value) => value.toFixed(2),
      "Lower values let more lit surfaces glow.",
      glowOff,
    ),
    number(
      "accentBrightness",
      "Accent brightness",
      [0, 0.5, 0.75, 1, 1.5, 2, 3],
      percent,
      "Brightness of the theme-colored fixtures and their reflections.",
    ),
    number(
      "exposure",
      "Garage exposure",
      [0.5, 0.65, 0.8, 1, 1.25, 1.5],
      percent,
    ),
    {
      id: "garage-environmentReflections",
      label: "Vehicle & wall reflections",
      value: settings.environmentReflections ? "On" : "Off",
      action: () =>
        update({ environmentReflections: !settings.environmentReflections }),
    },
    {
      id: "garage-floorReflections",
      label: "Floor reflections",
      value: settings.floorReflections ? "On" : "Off",
      action: () => update({ floorReflections: !settings.floorReflections }),
    },
    number(
      "reflectionStrength",
      "Floor reflectivity",
      [0, 0.25, 0.5, 0.75, 1],
      percent,
      undefined,
      !settings.floorReflections,
    ),
    number(
      "reflectionBlur",
      "Platform reflection softness",
      [0, 0.25, 0.5, 0.75, 1],
      percent,
      undefined,
      !settings.floorReflections,
    ),
    {
      id: "garage-reset",
      label: "Restore garage effects",
      value: "Reset",
      action: () => update({ ...DEFAULT_GARAGE_EFFECTS }),
    },
  ];
}
