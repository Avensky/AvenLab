import { useEffect } from "react";
import { useSocialStore } from "../../store/social/socialStore";
import { useUIStore } from "../../store/menus/uiStore";
import { useAlphaStore } from "../../store/alpha/alphaStore";
import {
  mapCatalog,
  useSelectionStore,
} from "../../store/selection/selectionStore";
export function useAlphaFlow() {
  const alpha = useSocialStore((s) => s.view?.alpha),
    screen = useUIStore((s) => s.screen);
  useEffect(() => {
    if (screen !== "queue" || !alpha?.active || alpha.queue) return;
    useAlphaStore.getState().chooseMode(alpha.active.mode);
    useAlphaStore.getState().chooseHero(alpha.active.hero);
    const map = mapCatalog.findIndex(
      (m) =>
        m.id ===
        useSocialStore
          .getState()
          .view?.worlds.find((w) => w.id === alpha.active!.world_id)?.map,
    );
    if (map >= 0) useSelectionStore.setState({ mapIndex: map });
    useUIStore.getState().setScreen("hero_select");
  }, [alpha, screen]);
}
