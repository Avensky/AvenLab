import type { CharacterShot } from "./characterEditorStore";

/** Bounds are measured after the actor has loaded, in the editor's world units. */
export function characterFrame(shot: CharacterShot, height: number, aspect: number, fov = 35) {
  const h = Math.max(.5, height);
  const regions = {
    "Full body": [.5, 1.12], Face: [.91, .24], "Upper body": [.71, .55],
    Waist: [.5, .4], Feet: [.12, .3], Back: [.5, 1.12], Left: [.5, 1.12], Right: [.5, 1.12],
  } as const;
  const [center, span] = regions[shot];
  const tangent = Math.tan(fov * Math.PI / 360);
  const distance = h * span / (2 * tangent * Math.min(1, Math.max(.2, aspect)));
  const angle = shot === "Back" ? Math.PI : shot === "Left" ? -Math.PI / 2 : shot === "Right" ? Math.PI / 2 : 0;
  return { center: h * center, distance, angle };
}
