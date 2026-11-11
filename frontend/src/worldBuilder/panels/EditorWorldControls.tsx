import { openCharacterEditor } from "../characterEditor/characterEditorStore";
import { EditorTestAction } from "../../game/alpha/EditorTestAction";
import { refreshInstalledWorlds, useWorldCatalog } from "../../store/selection/worldCatalog";
import { useEffect } from "react";
import { switchBuilderWorld } from "../state/builderActions";
import { useBuilderStore } from "../state/builderStore";
import { useEditorPreferences } from "../state/editorPreferences";
import type { DetailPreference } from "../vehicles/vehicleCatalog";

export function EditorWorldControls({
  compact = false,
}: {
  compact?: boolean;
}) {
  const source = useBuilderStore((s) => s.doc),
    loading = useBuilderStore((s) => s.loadingMap),
    preferences = useEditorPreferences();
  const worlds = useWorldCatalog((s) => s.maps),
    ready = useWorldCatalog((s) => s.ready),
    status = useWorldCatalog((s) => s.status);
  useEffect(() => {void refreshInstalledWorlds();}, []);
  const selected = loading ?? (source && worlds.some(world=>world.id===source.map_id)?source.map_id:"");
  return (
    <div className={`le-world-controls${compact ? " is-compact" : ""}`}>
      <label className="le-header-field le-world-field">
        <span>Editing world</span>
        <select
          aria-label="Editing world"
          aria-busy={Boolean(loading)}
          value={selected}
          onChange={(e) => void switchBuilderWorld(e.target.value)}
        >
          {!selected && (
            <option value="" disabled>
              {!ready?"Discovering worlds…":worlds.length?"Choose installed world":"No installed worlds"}
            </option>
          )}
          {worlds.map((world) => (
            <option key={world.id} value={world.id}>
              {world.name}
            </option>
          ))}
        </select>
      </label>
      {ready && !worlds.length && <span className="le-muted" role="status">{status}</span>}
      <button type="button" onClick={() => useBuilderStore.setState({ workspace: "vehicle" })}>EDIT VEHICLE</button>
      <button type="button" onClick={openCharacterEditor}>EDIT CHARACTER</button>
      <EditorTestAction />
      {!compact && (
        <>
          <label className="le-header-field le-detail-field">
            <span>Detail / LOD</span>
            <select
              aria-label="Editor detail"
              value={preferences.detail}
              onChange={(e) =>
                preferences.setDetail(e.target.value as DetailPreference)
              }
            >
              <option value="auto">Auto</option>
              <option value="low">Low</option>
              <option value="high">High</option>
            </select>
          </label>
        </>
      )}
    </div>
  );
}
