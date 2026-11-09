import type { MeshPhysicalMaterial } from "three";

export const WINDOW_TONES = {
  clear: { label: "Clear", color: "#68747d", opacity: .24, roughness: .20, specular: "#b9c2c9", specularIntensity: .42, ior: 1.36 },
  "light-smoke": { label: "Light smoke", color: "#3d4852", opacity: .50, roughness: .20, specular: "#aeb7bf", specularIntensity: .34, ior: 1.33 },
  "dark-smoke": { label: "Dark smoke", color: "#202830", opacity: .68, roughness: .22, specular: "#929ca5", specularIntensity: .27, ior: 1.30 },
  "ice-blue": { label: "Ice blue", color: "#4b7794", opacity: .39, roughness: .18, specular: "#b0d3ec", specularIntensity: .40, ior: 1.36 },
  bronze: { label: "Bronze", color: "#79543d", opacity: .46, roughness: .20, specular: "#dab294", specularIntensity: .35, ior: 1.35 },
  "sage-green": { label: "Sage green", color: "#4e6858", opacity: .39, roughness: .20, specular: "#b8d2bc", specularIntensity: .36, ior: 1.34 },
} as const;

export type WindowTone = keyof typeof WINDOW_TONES;
export const DEFAULT_WINDOW_TONE: WindowTone = "light-smoke";

export function applyWindowTone(materials: Iterable<MeshPhysicalMaterial>, tone: WindowTone) {
  const profile = WINDOW_TONES[tone];
  for (const material of materials) {
    material.color.set(profile.color);
    material.opacity = profile.opacity;
    material.roughness = profile.roughness;
    material.specularColor.set(profile.specular);
    material.specularIntensity = profile.specularIntensity;
    material.ior = profile.ior;
    material.metalness = 0;
    material.transmission = 0;
  }
}
