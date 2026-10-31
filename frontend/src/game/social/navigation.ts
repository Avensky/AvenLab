import {
  useSelectionStore,
  mapCatalog,
} from "../../store/selection/selectionStore";
import { useUIStore } from "../../store/menus/uiStore";

/** The existing garage remains the sole owner of the selected vehicle/spawn. */
export function enterWorld(result: Record<string, unknown>) {
  const index = mapCatalog.findIndex((map) => map.id === result.map);
  if (index < 0)
    throw new Error(
      "This world uses a map that is unavailable in this client.",
    );
  useSelectionStore.setState({ mapIndex: index });
  useUIStore.getState().setScreen("sandbox_setup");
}
