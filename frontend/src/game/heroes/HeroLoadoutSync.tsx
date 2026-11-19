import { useEffect } from "react";
import { useSocialStore } from "../../store/social/socialStore";
import { useHeroLoadouts } from "../../vehicles/cosmetics/heroLoadouts";

/** Profile synchronization stays available before the optional workshop loads. */
export function HeroLoadoutSync() {
  const owner = useSocialStore(s => s.view?.profile.id ?? null);
  const lastOwner = useSocialStore(s => s.profileOwner);
  const main = useSocialStore(s => s.view?.profile.progression?.default_hero);
  const loadouts = useSocialStore(s => s.view?.profile.progression?.hero_loadouts);
  useEffect(() => {
    if (owner || !lastOwner) useHeroLoadouts.getState().adopt(owner, main, loadouts);
  }, [owner, main, loadouts, lastOwner]);
  return null;
}
