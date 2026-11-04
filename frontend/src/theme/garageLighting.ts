import { Color, Mesh, MeshStandardMaterial, type Object3D } from "three";
import type { UITheme } from "./catalog";

/** Scene emission colors follow the saved UI theme, including light palettes
 * whose dark text accents would otherwise make poor luminous fixtures. */
export const SELECTION_CRIMSON = "#af5360";
export const GARAGE_LIGHT_COLORS: Record<UITheme, string> = {
  navy: "#4484ff",
  "hacker-blue": "#30d5ff",
  forest: "#82b887",
  hacker: "#5bff35",
  black: "#e5cb70",
  "deep-purple": "#7185ff",
  "pastel-purple": "#b49ade",
  scarlet: "#ef122c",
  strawberry: "#ff3caf",
  white: "#eff5ff",
};
export function tagGarageAccent(
  material: MeshStandardMaterial,
  tintBase = false,
) {
  material.userData.garageAccent = true;
  material.userData.garageAccentIntensity =
    material.emissive.r + material.emissive.g + material.emissive.b > 0
      ? material.emissiveIntensity
      : 0;
  material.userData.garageAccentTintBase = tintBase;
  material.userData.garageAccentBaseGain = Math.max(
    material.color.r,
    material.color.g,
    material.color.b,
  );
}
export function applyGarageLighting(
  root: Object3D,
  theme: UITheme,
  contrast: boolean,
  brightness = 1,
  accentOverride: string | null = null,
) {
  const color = new Color(contrast ? "#ffffff" : accentOverride ?? GARAGE_LIGHT_COLORS[theme]);
  // Blue/purple need more radiance than green to reach the same bloom threshold.
  // Match perceived fixture brightness without desaturating the selected hue.
  const luminance = color.r * 0.2126 + color.g * 0.7152 + color.b * 0.0722;
  const redFixture = (accentOverride ?? GARAGE_LIGHT_COLORS[theme]) === GARAGE_LIGHT_COLORS.scarlet;
  const gain = contrast ? 0.3 : accentOverride === SELECTION_CRIMSON ? 0.95 : Math.min(redFixture ? 1.5 : 4, 0.72 / Math.max(0.01, luminance));
  const visited = new Set<MeshStandardMaterial>();
  root.traverse((node) => {
    if (!(node instanceof Mesh)) return;
    for (const material of Array.isArray(node.material)
      ? node.material
      : [node.material]) {
      if (
        !(material instanceof MeshStandardMaterial) ||
        !material.userData.garageAccent ||
        visited.has(material)
      )
        continue;
      visited.add(material);
      material.emissive.copy(color);
      material.emissiveIntensity =
        Number(material.userData.garageAccentIntensity) * brightness * gain;
      if (material.userData.garageAccentTintBase)
        material.color
          .copy(color)
          .multiplyScalar(Number(material.userData.garageAccentBaseGain));
    }
  });
}
