import {
  useSelectionStore,
  mapCatalog,
} from "../../store/selection/selectionStore";
import { useUIStore } from "../../store/menus/uiStore";
import { useAlphaStore } from "../../store/alpha/alphaStore";
import { useSocialStore } from "../../store/social/socialStore";

/** The existing garage remains the sole owner of the selected vehicle/spawn. */
export function enterWorld(result: Record<string, unknown>) {
  const index = mapCatalog.findIndex((map) => map.id === result.map);
  if (index < 0)
    throw new Error(
      "This world uses a map that is unavailable in this client.",
    );
  useSelectionStore.setState({ mapIndex: index });
  const view = useSocialStore.getState().view;
  const world = view?.worlds.find(
    (world) => world.id === (result.world_id ?? view.current_world_id),
  );
  if (world?.mode) useAlphaStore.getState().chooseMode(world.mode);
  else if (view?.alpha?.active)
    useAlphaStore.getState().chooseMode(view.alpha.active.mode);
  else useAlphaStore.getState().chooseMode("sandbox");
  useUIStore.getState().setScreen("hero_select");
}
