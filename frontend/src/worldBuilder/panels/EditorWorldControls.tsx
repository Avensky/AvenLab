import { EditorTestAction } from "../../game/alpha/EditorTestAction";
import { mapCatalog } from "../../store/selection/worldCatalog";
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
  const worlds =
    source && !mapCatalog.some((m) => m.id === source.map_id)
      ? [...mapCatalog, { id: source.map_id, name: source.map_id, desc: "" }]
      : mapCatalog;
  return (
    <div className={`le-world-controls${compact ? " is-compact" : ""}`}>
      <label className="le-header-field le-world-field">
        <span>Editing world</span>
        <select
          aria-label="Editing world"
          aria-busy={Boolean(loading)}
          value={loading ?? source?.map_id ?? ""}
          onChange={(e) => void switchBuilderWorld(e.target.value)}
        >
          {!source && !loading && (
            <option value="" disabled>
              Choose world
            </option>
          )}
          {worlds.map((world) => (
            <option key={world.id} value={world.id}>
              {world.name}
            </option>
          ))}
        </select>
      </label>
      <button type="button" onClick={() => useBuilderStore.setState({ workspace: "vehicle" })}>EDIT VEHICLE</button>
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
