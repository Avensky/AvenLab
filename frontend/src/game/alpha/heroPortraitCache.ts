import { FACTORY_APPEARANCE, normalizeHeroAppearance, type HeroAppearance } from "../../vehicles/cosmetics/heroLoadouts";
import type { VehicleModelId } from "../../vehicles/tools/vehicleModelPaths";
import {isDrivingScreen, useUIStore} from "../../store/menus/uiStore";
import { DEFAULT_WINDOW_TONE, type WindowTone } from "../preview/windowTones";

export function portraitStyleKey(model: string, appearance: HeroAppearance, tone: WindowTone = DEFAULT_WINDOW_TONE): string {
  const style=normalizeHeroAppearance(appearance);
  return JSON.stringify([model, style.body.toLowerCase(), style.finish, style.seats, style.skin, style.metallic, tone]);
}
export function needsStyledPortrait(appearance: HeroAppearance): boolean {
  // Seat colors remain pending asset mapping in both showroom and portrait.
  const style=normalizeHeroAppearance(appearance);
  return style.body !== FACTORY_APPEARANCE.body || style.finish !== FACTORY_APPEARANCE.finish || style.metallic !== FACTORY_APPEARANCE.metallic;
}
/** Bounded image/promise cache; one bake at a time, shared by roster and squad.
 * No frame loop, per-card WebGL contexts or whole-image hue filters. */
export function createPortraitCache(render: (model: VehicleModelId, appearance: HeroAppearance, tone: WindowTone) => Promise<string>, limit = 48) {
  const cache = new Map<string, Promise<string>>();
  let queue = Promise.resolve();
  return (model: VehicleModelId, appearance: HeroAppearance, tone: WindowTone = DEFAULT_WINDOW_TONE): Promise<string> => {
    const key = portraitStyleKey(model, appearance, tone);
    const existing = cache.get(key);
    if (existing) { cache.delete(key); cache.set(key, existing); return existing; }
    const style = normalizeHeroAppearance(appearance);
    const result = queue.then(() => render(model, style, tone));
    queue = result.then(() => undefined, () => undefined);
    cache.set(key, result);
    while (cache.size > limit) cache.delete(cache.keys().next().value!);
    // Failed assets may be retried on a later mount, without poisoning the queue.
    void result.catch(() => { if (cache.get(key) === result) cache.delete(key); });
    return result;
  };
}
const readyPortraits = new Map<string, string>();
const listeners = new Map<string, Set<() => void>>();
/** Live squad cards can reuse a finished portrait without decoding a GLB or
 * creating another GPU context while the main scene is being simulated. */
export const peekStyledPortrait = (model: VehicleModelId, appearance: HeroAppearance, tone: WindowTone = DEFAULT_WINDOW_TONE) =>
  readyPortraits.get(portraitStyleKey(model, appearance, tone)) ?? null;
export const subscribeStyledPortrait = (key: string, listener: () => void) => {
  let subscribers=listeners.get(key);
  if(!subscribers){subscribers=new Set();listeners.set(key,subscribers);}
  subscribers.add(listener);
  return () => {
    subscribers!.delete(listener);
    if(!subscribers!.size)listeners.delete(key);
  };
};
export const getStyledPortrait = createPortraitCache(async (model, appearance, tone) => {
  // A job queued in the menu may reach the front only after deployment. Do not
  // start its loader/WebGL work in a live world; rejection evicts it for retry.
  if (isDrivingScreen(useUIStore.getState().screen)) throw Error("Styled portraits are generated in menus, not during gameplay.");
  if (typeof WebGLRenderingContext === "undefined") throw Error("WebGL unavailable");
  const { bakeHeroPortrait } = await import("../preview/bakeHeroPortrait");
  const image = await bakeHeroPortrait(model, appearance, tone);
  const key = portraitStyleKey(model, appearance, tone);
  readyPortraits.delete(key); readyPortraits.set(key, image);
  while (readyPortraits.size > 48) readyPortraits.delete(readyPortraits.keys().next().value!);
  for (const listener of listeners.get(key) ?? []) listener();
  return image;
});
