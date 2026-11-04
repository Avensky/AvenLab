import { FACTORY_APPEARANCE, type HeroAppearance } from "../../vehicles/cosmetics/heroLoadouts";
import type { VehicleModelId } from "../../vehicles/tools/vehicleModelPaths";

export function portraitStyleKey(model: string, appearance: HeroAppearance): string {
  return JSON.stringify([model, appearance.body.toLowerCase(), appearance.finish, appearance.seats, appearance.skin]);
}
export function needsStyledPortrait(appearance: HeroAppearance): boolean {
  // Seat colors remain pending asset mapping in both showroom and portrait.
  return appearance.body !== FACTORY_APPEARANCE.body || appearance.finish !== FACTORY_APPEARANCE.finish;
}
/** Bounded image/promise cache; one bake at a time, shared by roster and squad.
 * No frame loop, per-card WebGL contexts or whole-image hue filters. */
export function createPortraitCache(render: (model: VehicleModelId, appearance: HeroAppearance) => Promise<string>, limit = 48) {
  const cache = new Map<string, Promise<string>>();
  let queue = Promise.resolve();
  return (model: VehicleModelId, appearance: HeroAppearance): Promise<string> => {
    const key = portraitStyleKey(model, appearance);
    const existing = cache.get(key);
    if (existing) { cache.delete(key); cache.set(key, existing); return existing; }
    const style = { ...appearance };
    const result = queue.then(() => render(model, style));
    queue = result.then(() => undefined, () => undefined);
    cache.set(key, result);
    while (cache.size > limit) cache.delete(cache.keys().next().value!);
    // Failed assets may be retried on a later mount, without poisoning the queue.
    void result.catch(() => { if (cache.get(key) === result) cache.delete(key); });
    return result;
  };
}
const readyPortraits = new Map<string, string>();
const listeners = new Set<() => void>();
/** Live squad cards can reuse a finished portrait without decoding a GLB or
 * creating another GPU context while the main scene is being simulated. */
export const peekStyledPortrait = (model: VehicleModelId, appearance: HeroAppearance) =>
  readyPortraits.get(portraitStyleKey(model, appearance)) ?? null;
export const subscribeStyledPortraits = (listener: () => void) => {
  listeners.add(listener); return () => {listeners.delete(listener);};
};
export const getStyledPortrait = createPortraitCache(async (model, appearance) => {
  if (typeof WebGLRenderingContext === "undefined") throw Error("WebGL unavailable");
  const { bakeHeroPortrait } = await import("../preview/bakeHeroPortrait");
  const image = await bakeHeroPortrait(model, appearance);
  const key = portraitStyleKey(model, appearance);
  readyPortraits.delete(key); readyPortraits.set(key, image);
  while (readyPortraits.size > 48) readyPortraits.delete(readyPortraits.keys().next().value!);
  for (const listener of listeners) listener();
  return image;
});
