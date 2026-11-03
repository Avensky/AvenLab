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
export const getStyledPortrait = createPortraitCache(async (model, appearance) => {
  if (typeof WebGLRenderingContext === "undefined") throw Error("WebGL unavailable");
  const { bakeHeroPortrait } = await import("../preview/bakeHeroPortrait");
  return bakeHeroPortrait(model, appearance);
});
