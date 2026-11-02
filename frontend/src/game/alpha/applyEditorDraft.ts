import { requestSocial } from "../../net/socialClient";
import { useBuilderStore } from "../../worldBuilder/state/builderStore";
import { useLayoutStore } from "../../worldBuilder/state/layoutStore";
import { mapExport } from "../../worldBuilder/document/mapDocument";

/** Server swaps the isolated editor runtime only after complete validation. */
export async function applyEditorDraft() {
  const source = useBuilderStore.getState().doc;
  const layout = useLayoutStore.getState().doc;
  if (!source || layout?.map_id !== source.map_id) throw Error("Load a matching editor world first.");
  await requestSocial("editor_apply", { document: JSON.parse(mapExport({ ...source, authored_layout: layout })) });
}
