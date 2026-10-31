import { useRef, useState } from "react";
import { useSocialStore } from "../../store/social/socialStore";
import { useBuilderStore } from "../../worldBuilder/state/builderStore";
import { useLayoutStore } from "../../worldBuilder/state/layoutStore";
import { mapExport } from "../../worldBuilder/document/mapDocument";
import { closeWorldBuilder } from "../../worldBuilder/state/builderActions";
import { useUIStore } from "../../store/menus/uiStore";
import { useAlphaStore } from "../../store/alpha/alphaStore";
import {
  useSelectionStore,
  mapCatalog,
} from "../../store/selection/selectionStore";
import { requestSocial } from "../../net/socialClient";

/** Explicit apply, not pointer-move uploads. Rust validates/builds a complete
 * replacement before swapping only the editor runtime and resetting its car. */
export function EditorTestAction() {
  const active = useSocialStore((s) => s.view?.alpha?.active),
    source = useBuilderStore((s) => s.doc);
  const [status, setStatus] = useState(""),
    [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const test = async () => {
    if (pending.current) return;
    if (active?.mode !== "editor") {
      const map = mapCatalog.findIndex((m) => m.id === source?.map_id);
      closeWorldBuilder();
      if (map >= 0) useSelectionStore.setState({ mapIndex: map });
      useAlphaStore.getState().chooseMode("editor");
      useUIStore.getState().setScreen("hero_select");
      return;
    }
    pending.current = true;
    setBusy(true);
    setStatus("");
    try {
      const layout = useLayoutStore.getState().doc;
      if (!source) throw Error("Load an editor world first.");
      const document = JSON.parse(
        mapExport({
          ...source,
          ...(layout?.map_id === source.map_id
            ? { authored_layout: layout }
            : {}),
        }),
      );
      await requestSocial("editor_apply", { document });
      closeWorldBuilder();
      useUIStore.getState().closeOverlay();
    } catch (e) {
      setStatus((e as Error).message);
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  return (
    <div className="le-live-test">
      <button
        type="button"
        className="le-button"
        disabled={busy || !source}
        onClick={() => void test()}
        title="Validate the current draft, rebuild only your isolated editor physics world, and reset your test vehicle."
      >
        {busy
          ? "BUILDING PHYSICS…"
          : active?.mode === "editor"
            ? "APPLY & TEST DRIVE"
            : "RESERVE LIVE EDITOR"}
      </button>
      {status && <span role="status">{status}</span>}
    </div>
  );
}
