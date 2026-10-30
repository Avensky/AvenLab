import { useEffect, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { Icon, Thumbnail } from "../components/EditorArtwork";
import { NumberField } from "../components/NumberField";
import { pieceById, type V3 } from "../document/layoutDocument";
import { ModelInspector } from "../models/ModelInspector";
import { modelAsset, modelSolid } from "../models/modelCatalog";
import { RoadInspector } from "../roads/RoadInspector";
import { roadAsset, roleSolid } from "../roads/roadCatalog";
import { useBuilderStore } from "../state/builderStore";
import { useEditorPreferences } from "../state/editorPreferences";
import { layoutAction, useLayoutStore } from "../state/layoutStore";
import { SpawnInspector } from "./SpawnInspector";
export function LayoutInspector({
  planOnly,
  modelReference,
  setPreview,
  projectAction,
  importFile,
  exportLayout,
}: {
  planOnly: boolean;
  modelReference: boolean;
  setPreview: (id: string) => void;
  projectAction: (action: "new" | "example") => void;
  importFile: (file: File) => Promise<void>;
  exportLayout: () => void;
}) {
  const s = useLayoutStore(
    useShallow((s) => ({
      doc: s.doc,
      selected: s.selected,
      selectedSpawn: s.selectedSpawn,
      placing: s.placing,
      cursor: s.cursor,
      placementYaw: s.placementYaw,
      snap: s.snap,
      angleSnap: s.angleSnap,
      magnet: s.magnet,
      snapBasis: s.snapBasis,
      magnetRadius: s.magnetRadius,
      wireframe: s.wireframe,
      reference: s.reference,
      view: s.view,
      cameraRevision: s.cameraRevision,
      commit: s.commit,
      update: s.update,
      place: s.place,
      rotate: s.rotate,
      select: s.select,
      duplicate: s.duplicate,
      remove: s.remove,
      restore: s.restore,
    })),
  );
  const [tab, setTab] = useState<
    "selection" | "world" | "spawns" | "scene" | "snapping" | "files"
  >(() => (s.selectedSpawn ? "spawns" : "selection"));
  useEffect(
    () =>
      useLayoutStore.subscribe((state, previous) => {
        if (
          state.selectedSpawn !== previous.selectedSpawn &&
          state.selectedSpawn
        )
          setTab("spawns");
        else if (
          (state.selected !== previous.selected ||
            state.placing !== previous.placing) &&
          (state.selected || state.placing)
        )
          setTab("selection");
      }),
    [],
  );
  const file = useRef<HTMLInputElement>(null),
    preferences = useEditorPreferences(),
    item = s.doc?.objects.find((o) => o.id === s.selected),
    activePiece = s.placing ? pieceById(s.placing) : undefined;
  const updateAxis = (
    group: "position" | "size",
    axis: number,
    value: number,
  ) => {
    if (!item) return;
    const v = [...item[group]] as V3;
    v[axis] = value;
    s.update({ [group]: v });
  };
  return (
    <aside
      id="world-inspector"
      className="le-inspector"
      data-compact={preferences.inspector === "compact"}
    >
      <nav className="le-inspector-tabs" aria-label="Inspector sections">
        {(
          [
            "selection",
            "spawns",
            "world",
            "scene",
            "snapping",
            "files",
          ] as const
        ).map((id) => (
          <button key={id} aria-pressed={tab === id} onClick={() => setTab(id)}>
            {id}
          </button>
        ))}
      </nav>
      {(tab === "selection" || tab === "world") && (
        <>
          <div className="le-section-title">
            <span>
              {tab === "world"
                ? "WORLD SETTINGS"
                : activePiece
                  ? "PLACEMENT"
                  : item
                    ? "INSPECTOR"
                    : "SELECTION"}
            </span>
            <Icon name={item ? "cube" : "layers"} />
          </div>
          {tab === "selection" && activePiece ? (
            <div className="le-inspector-content">
              <span className="le-small-label">READY TO PLACE</span>
              <h2>{activePiece.label}</h2>
              <p className="le-muted">{activePiece.description}</p>
              <div className="le-active-thumb">
                <Thumbnail piece={activePiece} />
                <button
                  className="le-wide"
                  onClick={() => setPreview(activePiece.id)}
                >
                  Open 3D preview
                </button>
              </div>
              <h3>
                Cursor position <small>metres</small>
              </h3>
              <div className="le-number-row">
                {["Cursor X", "Cursor Y", "Cursor Z"].map((label, i) => (
                  <NumberField
                    key={label}
                    label={label}
                    value={s.cursor[i]}
                    step={s.snap}
                    onCommit={(v) => {
                      const cursor = [...s.cursor] as V3;
                      cursor[i] = v;
                      if (Math.abs(v) > 100000)
                        throw Error("Cursor is out of range");
                      useLayoutStore.setState({ cursor });
                    }}
                  />
                ))}
              </div>
              <NumberField
                label="Placement yaw"
                value={s.placementYaw}
                step={s.angleSnap}
                onCommit={(placementYaw) => {
                  if (Math.abs(placementYaw) > 36000)
                    throw Error("Rotation is out of range");
                  useLayoutStore.setState({ placementYaw });
                }}
              />
              <button
                className="le-primary le-wide"
                onClick={() => layoutAction(() => s.place(s.cursor))}
              >
                + Place at cursor
              </button>
              <div className="le-twin">
                <button onClick={() => layoutAction(() => s.rotate(-1))}>
                  ↶ Turn left
                </button>
                <button onClick={() => layoutAction(() => s.rotate(1))}>
                  ↷ Turn right
                </button>
              </div>
              <button
                className="le-wide"
                onClick={() => useLayoutStore.setState({ placing: null })}
              >
                Finish placing · Esc
              </button>
              <p className="le-tip">
                Click the ground to place repeated copies. The cursor fields
                also work with a controller.
              </p>
            </div>
          ) : tab === "selection" && item ? (
            <div className="le-inspector-content">
              <span className="le-small-label">
                {item.piece.toUpperCase()} /{" "}
                {s.doc!.objects.findIndex((o) => o.id === item.id) + 1}
              </span>
              <input
                key={item.id + item.name}
                className="le-object-name"
                aria-label="Piece name"
                defaultValue={item.name}
                disabled={item.locked}
                maxLength={80}
                onBlur={(e) =>
                  layoutAction(() => s.update({ name: e.currentTarget.value }))
                }
              />
              <h3>
                Position <small>metres · base elevation</small>
              </h3>
              <div className="le-number-row">
                {["X", "Y", "Z"].map((axis, i) => (
                  <NumberField
                    key={axis}
                    label={`Position ${axis}`}
                    value={item.position[i]}
                    step={s.snap}
                    disabled={item.locked}
                    onCommit={(v) => updateAxis("position", i, v)}
                  />
                ))}
              </div>
              <h3>
                Dimensions <small>full size</small>
              </h3>
              <div className="le-number-row">
                {["Width", "Height", "Depth"].map((axis, i) => (
                  <NumberField
                    key={axis}
                    label={axis}
                    value={item.size[i]}
                    step={s.snap}
                    disabled={item.locked}
                    onCommit={(v) => updateAxis("size", i, v)}
                  />
                ))}
              </div>
              <h3>
                Rotation <small>around Y</small>
              </h3>
              <div className="le-rotation">
                <NumberField
                  label="Yaw"
                  value={item.yaw}
                  step={s.angleSnap}
                  disabled={item.locked}
                  onCommit={(yaw) => s.update({ yaw })}
                />
                <button
                  aria-label="Rotate left"
                  disabled={item.locked}
                  onClick={() => layoutAction(() => s.rotate(-1))}
                >
                  ↶
                </button>
                <button
                  aria-label="Rotate right"
                  disabled={item.locked}
                  onClick={() => layoutAction(() => s.rotate(1))}
                >
                  ↷
                </button>
              </div>
              {item.model && <ModelInspector item={item} />}{" "}
              {item.vehicle && (
                <>
                  <label className="le-road-lod">
                    Vehicle detail
                    <select
                      aria-label="Vehicle detail"
                      value={item.vehicle.lod}
                      disabled={item.locked}
                      onChange={(e) =>
                        layoutAction(() =>
                          s.update({
                            vehicle: {
                              ...item.vehicle!,
                              lod: e.target.value as "auto" | "proxy" | "full",
                            },
                          }),
                        )
                      }
                    >
                      <option value="auto">Auto LOD</option>
                      <option value="proxy">Proxy</option>
                      <option value="full">Prefer full</option>
                    </select>
                  </label>
                  <p className="le-tip">
                    Static traffic/background prop. Uses no player controls or
                    vehicle simulation.
                  </p>
                </>
              )}
              <div className="le-twin">
                <button onClick={() => setPreview(item.piece)}>
                  Preview source
                </button>
                <button
                  aria-label="Focus selected piece"
                  onClick={() =>
                    useLayoutStore.setState({
                      focus: "selected",
                      cameraRevision: s.cameraRevision + 1,
                    })
                  }
                >
                  Focus in world
                </button>
              </div>
              {item.road && <RoadInspector item={item} />}
              <label className="le-color">
                Piece color
                <input
                  aria-label="Piece color"
                  type="color"
                  value={item.color}
                  disabled={
                    item.locked ||
                    Boolean(item.road || item.model || item.vehicle)
                  }
                  onChange={(e) =>
                    layoutAction(() => s.update({ color: e.target.value }))
                  }
                />
                <code>{item.color}</code>
              </label>
              <label className="le-check">
                <input
                  type="checkbox"
                  checked={item.solid}
                  disabled={item.locked || Boolean(item.vehicle)}
                  onChange={(e) =>
                    layoutAction(() => s.update({ solid: e.target.checked }))
                  }
                />
                <span>
                  {item.vehicle
                    ? "Background vehicle · no physics"
                    : "Physical collisions"}
                  <small>
                    {item.model
                      ? modelAsset(item.model.asset)!.colliders.filter((c) =>
                          modelSolid(c.role, item.model!),
                        ).length
                      : item.road
                        ? roadAsset(item.road.asset)!.colliders.filter((c) =>
                            roleSolid(c.role, item.road!),
                          ).length
                        : item.parts.filter((p) => p.solid !== false)
                            .length}{" "}
                    {item.road || item.model
                      ? "measured surface groups"
                      : "explicit shapes"}
                  </small>
                </span>
              </label>
              <label className="le-check">
                <input
                  type="checkbox"
                  checked={item.locked}
                  onChange={(e) =>
                    layoutAction(() => s.update({ locked: e.target.checked }))
                  }
                />
                <span>Lock this piece</span>
              </label>
              <div className="le-twin">
                <button onClick={() => layoutAction(s.duplicate)}>
                  <Icon name="duplicate" />
                  Duplicate
                </button>
                <button
                  disabled={item.locked}
                  className="le-delete"
                  onClick={() => layoutAction(s.remove)}
                >
                  Delete
                </button>
              </div>
              <p className="le-tip">
                {item.piece === "ramp"
                  ? `Slope ${Math.round((Math.atan2(item.size[1], item.size[2]) * 180) / Math.PI)}°. The high edge faces local −Z.`
                  : item.piece === "garage"
                    ? "The walls, roof and front opening are separate shapes. You can drive through the opening."
                    : "Use the handles in Perspective, drag in Plan with Move, or enter exact measurements."}
              </p>
            </div>
          ) : tab === "selection" ? (
            <p className="le-tip">
              Select a piece in the world or choose a prefab from the library.
              World settings, spawns, files and snapping have their own tabs.
            </p>
          ) : (
            <div className="le-inspector-content">
              <span className="le-small-label">PROJECT SETTINGS</span>
              <h2>World settings</h2>
              <label className="le-check">
                <input
                  type="checkbox"
                  checked={s.doc?.base === "overlay"}
                  disabled={!s.doc}
                  onChange={(e) =>
                    layoutAction(() => {
                      if (s.doc)
                        s.commit({
                          ...s.doc,
                          base: e.target.checked ? "overlay" : "replace",
                        });
                    })
                  }
                />
                <span>
                  Include existing city
                  <small>
                    {s.doc?.base === "overlay"
                      ? "Your pieces extend the current map"
                      : "Export uses only your authored pieces"}
                  </small>
                </span>
              </label>
              <label className="le-check">
                <input
                  type="checkbox"
                  aria-label="Support ground"
                  checked={s.doc?.ground !== false}
                  disabled={!s.doc || s.doc.base === "overlay"}
                  onChange={(e) =>
                    layoutAction(() => {
                      if (s.doc)
                        s.commit({ ...s.doc, ground: e.target.checked });
                    })
                  }
                />
                <span>
                  Support ground
                  <small>Turn off for roads, gaps and open interiors</small>
                </span>
              </label>
              <label className="le-check">
                <input
                  type="checkbox"
                  aria-label="Repeat layout tile"
                  checked={s.doc?.repeat !== false}
                  disabled={!s.doc || s.doc.base === "overlay"}
                  onChange={(e) =>
                    layoutAction(() => {
                      if (s.doc)
                        s.commit({ ...s.doc, repeat: e.target.checked });
                    })
                  }
                />
                <span>
                  Repeat layout as a map tile
                  <small>Off exports one district with road spawns</small>
                </span>
              </label>
              <div className="le-project-stats">
                <span>
                  <strong>{s.doc?.objects.length ?? 0}</strong>pieces placed
                </span>
                <span>
                  <strong>
                    {s.doc?.objects.reduce(
                      (n, o) =>
                        n +
                        (o.solid
                          ? o.model
                            ? modelAsset(o.model.asset)!.colliders.filter((c) =>
                                modelSolid(c.role, o.model!),
                              ).length
                            : o.road
                              ? roadAsset(o.road.asset)!.colliders.filter((c) =>
                                  roleSolid(c.role, o.road!),
                                ).length
                              : o.parts.filter((p) => p.solid !== false).length
                          : 0),
                      0,
                    ) ?? 0}
                  </strong>
                  collision shapes
                </span>
              </div>
              <p className="le-tip">
                Place individual walls to make real alleys and openings. Stack
                floors and connect them with a ramp.{" "}
                {s.doc?.repeat === false
                  ? "This district exports once, with no overlapping repeated roads."
                  : "This template repeats in every map tile."}
              </p>
            </div>
          )}
        </>
      )}
      {tab === "spawns" && <SpawnInspector />}
      {tab === "scene" && (
        <div className="le-scene-section">
          <div className="le-section-title">
            <span>SCENE</span>
            <span>{s.doc?.objects.length ?? 0} / 512</span>
          </div>
          <div className="le-scene-list">
            {s.doc?.objects.length ? (
              [...s.doc.objects].reverse().map((o) => (
                <button
                  key={o.id}
                  aria-pressed={o.id === s.selected && !s.placing}
                  onClick={() => s.select(o.id)}
                >
                  <span
                    className="le-object-dot"
                    style={{ background: o.color }}
                  />
                  <span>{o.name}</span>
                  <small>{o.locked ? "LOCK" : o.piece}</small>
                </button>
              ))
            ) : (
              <p>Your pieces will appear here.</p>
            )}
          </div>
        </div>
      )}
      {(tab === "snapping" || tab === "files") && (
        <div className="le-project-controls">
          {tab === "snapping" && (
            <>
              <label className="le-check">
                <input
                  type="checkbox"
                  aria-label="Show chunk guide"
                  checked={preferences.chunkGuide}
                  onChange={(e) => preferences.setChunkGuide(e.target.checked)}
                />
                <span>
                  200 m chunk guide
                  <small>Four block quadrants · placement aid</small>
                </span>
              </label>
              <label className="le-check">
                <input
                  type="checkbox"
                  aria-label="Magnetic snapping"
                  checked={s.magnet}
                  onChange={(e) =>
                    useLayoutStore.setState({ magnet: e.target.checked })
                  }
                />
                <span>
                  Magnetic snapping<small>Corners first, then edges</small>
                </span>
              </label>
              <label className="le-road-lod">
                Snap boundary
                <select
                  aria-label="Snap boundary"
                  value={s.snapBasis}
                  onChange={(e) =>
                    useLayoutStore.setState({
                      snapBasis: e.target.value as "outer" | "asphalt",
                    })
                  }
                >
                  <option value="outer">Visible outer edge</option>
                  <option value="asphalt">Asphalt · join carriageways</option>
                </select>
              </label>
              <NumberField
                label="Magnet radius"
                value={s.magnetRadius}
                step={0.25}
                onCommit={(v) => {
                  if (v < 0.1 || v > 10)
                    throw Error("Use a radius from 0.1 to 10 metres");
                  useLayoutStore.setState({ magnetRadius: v });
                }}
              />
              <label className="le-check">
                <input
                  type="checkbox"
                  checked={s.wireframe}
                  onChange={(e) =>
                    useLayoutStore.setState({ wireframe: e.target.checked })
                  }
                />
                <span>Collision view</span>
              </label>
              <label className="le-check">
                <input
                  type="checkbox"
                  checked={s.reference}
                  disabled={planOnly || !modelReference || s.view === "plan"}
                  onChange={(e) =>
                    useLayoutStore.setState({ reference: e.target.checked })
                  }
                />
                <span>
                  Full world GLB reference
                  <small>
                    {modelReference
                      ? "Loads your existing models"
                      : "Available inside the game"}
                  </small>
                </span>
              </label>
            </>
          )}
          {tab === "files" && (
            <>
              <label className="le-title-label">
                Export title
                <input
                  aria-label="Layout export title"
                  key={s.doc?.title}
                  defaultValue={s.doc?.title ?? ""}
                  maxLength={80}
                  onBlur={(e) =>
                    layoutAction(() => {
                      if (s.doc)
                        s.commit({ ...s.doc, title: e.currentTarget.value });
                    })
                  }
                />
              </label>
              <div className="le-twin">
                <button disabled={!s.doc} onClick={() => projectAction("new")}>
                  New layout
                </button>
                <button
                  disabled={!s.doc}
                  onClick={() => projectAction("example")}
                >
                  Example block
                </button>
              </div>
              <div className="le-twin">
                <button
                  disabled={!s.doc}
                  onClick={() => layoutAction(s.restore)}
                >
                  Load saved
                </button>
                <button onClick={() => file.current?.click()}>
                  Import JSON
                </button>
              </div>
              <button
                className="le-wide"
                disabled={!s.doc}
                onClick={() => exportLayout}
              >
                <Icon name="export" />
                Export layout JSON
              </button>
              <button
                className="le-collision-link"
                onClick={() =>
                  useBuilderStore.setState({ workspace: "colliders" })
                }
              >
                Open original collision template ↗
              </button>
              <input
                hidden
                ref={file}
                aria-label="Import layout JSON"
                type="file"
                accept="application/json,.json"
                onChange={(e) => {
                  const f = e.currentTarget.files?.[0];
                  e.currentTarget.value = "";
                  if (f) void importFile(f);
                }}
              />
            </>
          )}
        </div>
      )}
    </aside>
  );
}
