import { kitAsset } from "../mapKit/catalog";
import { ExcavationTools } from './ExcavationTools';
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useShallow } from "zustand/react/shallow";
import { usePreferencesStore } from "../../store/preferences";
import { ControllerAction } from "../../components/controller";
import "../../components/menus/menus.css";
import { isTypingTarget, type MenuAction } from "../../controls/inputRouting";
import { useUIStore } from "../../store/menus/uiStore";
import { Icon } from "../components/EditorArtwork";
import { PrefabPortrait } from "../components/PrefabPortrait";
import {
  initialMapLayout,
  layoutJSON,
  MAX_LAYOUT_BYTES,
  pieceById,
  PIECES,
  type Piece,
} from "../document/layoutDocument";
import { inLibraryTab, type LibraryTab } from "../document/libraryCatalog";
import { LAYOUT_LEVELS, layoutLevel } from "../document/layoutLevels";
import { mapExport } from "../document/mapDocument";
import { COASTAL_MAP_ID, parseDistrictImport } from "../generation/coastalMap";
import {recordedNavalRoute} from '../generation/navalRoutes';
import { sourceSpawns } from "../document/spawnDocument";
import "../layoutEditor.css";
import { LayoutPlan } from "../scene/LayoutPlan";
import {
  closeWorldBuilder,
  loadStandaloneBuilder,
  openCoastalDistrict,
} from "../state/builderActions";
import { useBuilderStore } from "../state/builderStore";
import {
  editorPaletteCSS,
  useEditorPalette,
  useEditorPreferences,
} from "../state/editorPreferences";
import { layoutAction, useLayoutStore } from "../state/layoutStore";
import "../universalEditor.css";
import { CollisionBuilderPanel } from "./CollisionBuilderPanel";
import { EditorWorldControls } from "./EditorWorldControls";
import { LayoutInspector } from "./LayoutInspector";
import { VehicleEditorPanel } from "../vehicleEditor/VehicleEditorPanel";
import { LibraryTabs } from "./LibraryTabs";

const PiecePreview = lazy(() => import("./PiecePreview"));

function download(name: string, text: string) {
  const url = URL.createObjectURL(
      new Blob([text], { type: "application/json" }),
    ),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
function LayoutPanel({
  planOnly = false,
  modelReference = true,
}: {
  planOnly?: boolean;
  modelReference?: boolean;
}) {
  const s = useLayoutStore(
      useShallow((s) => ({
        doc: s.doc,
        saved: s.saved,
        selected: s.selected,
        placing: s.placing,
        view: s.view,
        tool: s.tool,
        navigation: s.navigation,
        past: s.past,
        future: s.future,
        snap: s.snap,
        placementLevel: s.placementLevel,
        setPlacementLevel: s.setPlacementLevel,
        angleSnap: s.angleSnap,
        camera: s.camera,
        cameraRevision: s.cameraRevision,
        status: s.status,
        save: s.save,
        commit: s.commit,
        newLayout: s.newLayout,
        undo: s.undo,
        redo: s.redo,
      })),
    ),
    source = useBuilderStore((state) => state.doc),
    sourceStatus = useBuilderStore((state) => state.status),
    loadingMap = useBuilderStore((state) => state.loadingMap);
  const presentation = useBuilderStore((state) => state.presentation);
  const root = useRef<HTMLElement>(null),
    importSequence = useRef(0);
  const [category, setCategory] = useState<LibraryTab>("all"),
    [search, setSearch] = useState(""),
    [confirm, setConfirm] = useState<"new" | "example" | null>(null);

  const library = useMemo(
    () =>
      PIECES.filter(
        (p) =>
          inLibraryTab(p, category) &&
          (p.label + p.description)
            .toLowerCase()
            .includes(search.toLowerCase()),
      ),
    [category, search],
  );
  const navalRoute=useMemo(()=>recordedNavalRoute(s.doc?.objects??[]),[s.doc]);
  const preferences = useEditorPreferences(),
    palette = useEditorPalette();
  const appTheme = usePreferencesStore(s => s.theme);
  const [toolsOpen, setToolsOpen] = useState(false);
  useEffect(() => {
    if (toolsOpen) root.current?.querySelector<HTMLButtonElement>(".le-tool-drawer button")?.focus();
  }, [toolsOpen]);
  const [preview, setPreview] = useState<string | null>(null);
  const dirty = Boolean(s.doc && s.doc !== s.saved);
  useEffect(() => {
    if (source)
      layoutAction(() =>
        useLayoutStore
          .getState()
          .initialize(
            source.map_id,
            initialMapLayout(source.map_id, source.authored_layout),
            sourceSpawns(source),
          ),
      );
  }, [source]);
  useEffect(() => {
    if (!source && useUIStore.getState().screen === "world_builder")
      void loadStandaloneBuilder();
  }, [source]);
  useEffect(() => {
    if (!s.doc || s.doc === s.saved) return;
    const timer = window.setTimeout(
      () => useLayoutStore.getState().save(),
      1500,
    );
    return () => window.clearTimeout(timer);
  }, [s.doc, s.saved]);
  useEffect(() => {
    const save = () => {
      const state = useLayoutStore.getState();
      if (state.doc && state.doc !== state.saved) state.save();
    };
    window.addEventListener("pagehide", save);
    return () => {
      window.removeEventListener("pagehide", save);
      save();
    };
  }, []);
  const navigate = useCallback((action: MenuAction) => {
    const state = useLayoutStore.getState();
    if (action === "back") {
      const drawer = root.current?.querySelector<HTMLButtonElement>('[aria-label="Close world tools"]');
      if (drawer) { drawer.click(); return; }
      const dialog =
        root.current?.querySelector<HTMLElement>('[role="dialog"]');
      if (dialog) {
        dialog.querySelector<HTMLButtonElement>("button")?.click();
        return;
      }
      const cancel = new Event("avenlab:cancel-authoring", {
        cancelable: true,
      });
      window.dispatchEvent(cancel);
      if (cancel.defaultPrevented) return;
      if (state.placing)
        useLayoutStore.setState({
          placing: null,
          status: "Placement finished.",
        });
      else closeWorldBuilder();
      return;
    }
    if (action === "previous_tab" || action === "next_tab") {
      state.cycle(action === "previous_tab" ? -1 : 1);
      return;
    }
    const area =
      root.current?.querySelector('[role="dialog"]') ??
      root.current?.querySelector(".le-tool-drawer") ??
      (useBuilderStore.getState().loadingMap
        ? root.current?.querySelector(".le-header")
        : root.current);
    const buttons = [
        ...(area?.querySelectorAll<HTMLElement>(
          "button:not(:disabled),input:not(:disabled):not([hidden]),select:not(:disabled)",
        ) ?? []),
      ].filter(element => element.getClientRects().length > 0),
      current = buttons.indexOf(document.activeElement as HTMLElement),
      active = buttons[current];
    if (
      active?.tagName === "SELECT" &&
      ["activate", "left", "right"].includes(action)
    ) {
      const select = active as HTMLSelectElement;
      select.selectedIndex =
        (select.selectedIndex +
          (action === "left" ? -1 : 1) +
          select.options.length) %
        select.options.length;
      select.dispatchEvent(new Event("change", { bubbles: true }));
      return;
    }
    if (action === "activate") {
      (active ?? buttons[0])?.click();
      return;
    }
    const next =
      buttons[
        (current +
          (action === "up" || action === "left" ? -1 : 1) +
          buttons.length) %
          buttons.length
      ];
    next?.focus();
    next?.scrollIntoView({ block: "nearest" });
  }, []);
  useEffect(() => {
    const sequence = importSequence,
      controller = (e: Event) =>
        navigate((e as CustomEvent<MenuAction>).detail);
    const key = (e: KeyboardEvent) => {
      const ui = useUIStore.getState();
      if (
        (ui.overlay !== "world_builder" && ui.screen !== "world_builder") ||
        isTypingTarget(e.target) ||
        (e.repeat && e.code !== "PageUp" && e.code !== "PageDown") ||
        e.defaultPrevented
      )
        return;
      if (root.current?.querySelector('[role="dialog"]') && e.code !== "Escape")
        return;
      if (useBuilderStore.getState().loadingMap && e.code !== "Escape") return;
      const state = useLayoutStore.getState(),
        mod = e.ctrlKey || e.metaKey;
      let action: (() => unknown) | undefined;
      if (mod && e.code === "KeyZ")
        action = e.shiftKey ? state.redo : state.undo;
      else if (mod && e.code === "KeyY") action = state.redo;
      else if (mod && e.code === "KeyS") action = state.save;
      else if (mod && e.code === "KeyD") action = state.duplicate;
      else if (!mod && !e.altKey) {
        if (e.code === "Delete" || e.code === "Backspace")
          action = state.selectedSpawn ? state.removeSpawn : state.remove;
        else if (e.code === "Escape") action = () => navigate("back");
        else if (e.code === "KeyQ" || e.code === "KeyE")
          action = () => state.rotate(e.code === "KeyQ" ? -1 : 1);
        else if (e.code === "PageUp" || e.code === "PageDown")
          action = () => {
            const index = LAYOUT_LEVELS.findIndex((level) => level.id === state.placementLevel);
            const next = Math.max(0, Math.min(LAYOUT_LEVELS.length - 1,
              index + (e.code === "PageUp" ? 1 : -1)*(e.shiftKey?10:1)));
            state.setPlacementLevel(LAYOUT_LEVELS[next].id);
          };
        else if (e.code === "KeyF")
          action = () =>
            useLayoutStore.setState({
              focus:
                state.selected || state.selectedSpawn ? "selected" : "layout",
              cameraRevision: state.cameraRevision + 1,
            });
        else if (["KeyV", "KeyW", "KeyR", "KeyS"].includes(e.code))
          action = () =>
            useLayoutStore.setState({
              placing: null,
              navigation: "orbit",
              tool: (
                {
                  KeyV: "select",
                  KeyW: "translate",
                  KeyR: "rotate",
                  KeyS: "scale",
                } as const
              )[e.code as "KeyV" | "KeyW" | "KeyR" | "KeyS"],
            });
      }
      if (action) {
        e.preventDefault();
        e.stopImmediatePropagation();
        layoutAction(action);
      }
    };
    window.addEventListener("avenlab:panel-action", controller);
    window.addEventListener("keydown", key, true);
    return () => {
      sequence.current++;
      window.removeEventListener("avenlab:panel-action", controller);
      window.removeEventListener("keydown", key, true);
    };
  }, [navigate]);
  const importFile = async (selected: File) => {
    const token = ++importSequence.current,
      originalMap = s.doc?.map_id;
    let mapId = originalMap;
    try {
      if (selected.size > MAX_LAYOUT_BYTES)
        throw Error(`Layout JSON exceeds ${MAX_LAYOUT_BYTES / (1024 * 1024)} MiB`);
      const { layout: doc, coastal } = parseDistrictImport(await selected.text(), mapId);
      if (token !== importSequence.current || useLayoutStore.getState().doc?.map_id !== originalMap) return;
      if (coastal && mapId !== COASTAL_MAP_ID) {
        await openCoastalDistrict();
        mapId = COASTAL_MAP_ID;
      }
      if (
        token !== importSequence.current ||
        useLayoutStore.getState().doc?.map_id !== mapId
      )
        return;
      useLayoutStore
        .getState()
        .commit(doc, coastal ? "Coastal layout imported into its own world. Save, then Apply & Test Drive to rebuild/reset at its spawns. Original map draft retained; Undo is available." : "Layout imported. Undo is available.");
      useLayoutStore.setState({
        selected: null,
        placing: null,
        cameraRevision: useLayoutStore.getState().cameraRevision + 1,
      });
    } catch (error) {
      if (token === importSequence.current)
        layoutAction(() => {
          throw error;
        });
    }
  };
  const choose = (piece: Piece) => {
    const floor = source?.surface.road_y ?? 0;
    useLayoutStore.setState({
      placing: piece.id,
      navigation: "orbit",
      selected: null,
      cursor: [
        useLayoutStore.getState().cursor[0],
        floor - (piece.category === "roads" && !piece.road && !kitAsset(piece.id) ? piece.size[1] : 0),
        useLayoutStore.getState().cursor[2],
      ],
      status: `Placing ${piece.label.toLowerCase()}. Click the ground; Q / E rotates. Esc finishes.`,
    });
  };
  const projectAction = (action: "new" | "example") => {
    if (s.doc?.objects.length) setConfirm(action);
    else s.newLayout(action === "example", source?.surface.road_y);
  };
  return (
    <section
      ref={root}
      className={`layout-editor menu-surface${presentation === "hud" ? " layout-editor--hud" : ""}`}
      data-inspector={presentation === "hud" ? "hidden" : preferences.inspector}
      data-editor-theme={appTheme}
      data-library={preferences.libraryVisible ? "open" : "hidden"}
      style={editorPaletteCSS(palette)}
      aria-label="World layout editor"
      onKeyDown={(e) => {
        if (isTypingTarget(e.target)) return;
        const action = (
          {
            ArrowUp: "up",
            ArrowDown: "down",
            ArrowLeft: "left",
            ArrowRight: "right",
          } as Record<string, MenuAction>
        )[e.key];
        if (action) {
          e.preventDefault();
          e.stopPropagation();
          navigate(action);
        } else if (e.key === "Enter" || e.key === " ") e.stopPropagation();
      }}
    >
      <header className="le-header" inert={Boolean(confirm || preview)}>
        <div className="le-brand">
          <span className="le-brand-mark">
            <Icon name="layers" />
          </span>
          <strong>World editor</strong>
        </div>

        <div className="le-project">
          <span className={`le-save-dot ${dirty ? "is-dirty" : ""}`} />
          <span title={s.doc?.title}>
            {s.doc?.title ?? "Opening world…"}
            <small>
              {s.doc?.base === "overlay" ? "SHARED CITY TILE" : "LOCAL DRAFT"}
            </small>
          </span>
        </div>
        <div className="le-header-actions">
          <button className="le-library-toggle" aria-controls="world-prefab-sidebar" aria-expanded={preferences.libraryVisible} onClick={preferences.toggleLibrary}>
            {preferences.libraryVisible ? "HIDE PREFABS" : "SHOW PREFABS"}
          </button>
          <button className="le-tool-toggle" aria-controls="world-tool-drawer" aria-expanded={toolsOpen} onClick={() => setToolsOpen(v => !v)}>TOOLS</button>
          <ControllerAction button="B" className="le-close" aria-label="Close world builder" onClick={closeWorldBuilder}> Exit</ControllerAction>
        </div>
      </header>
      {toolsOpen && <aside id="world-tool-drawer" className="le-tool-drawer" aria-label="World editor tools" inert={Boolean(confirm || preview)}>
        <div className="le-drawer-title"><strong>WORLD TOOLS</strong><button aria-label="Close world tools" onClick={() => { setToolsOpen(false); root.current?.querySelector<HTMLButtonElement>(".le-tool-toggle")?.focus(); }}>CLOSE</button></div>
        <h3>World, vehicle & test</h3>
        <EditorWorldControls />
        <ExcavationTools />
        <h3>Workspace & files</h3>
        <div className="le-drawer-actions">
        <button className="le-presentation-toggle" onClick={() => {
          const hud = presentation !== "hud";
          useBuilderStore.setState({presentation:hud ? "hud" : "workspace"});
          if(hud) useLayoutStore.setState({view:"3d"});
        }}>{presentation === "hud" ? "FULL EDITOR" : "BUILD IN WORLD"}</button>
          <button
            aria-controls="world-inspector"
            aria-expanded={preferences.inspector !== "hidden"}
            aria-label={
              preferences.inspector === "hidden"
                ? "Show inspector"
                : "Hide inspector"
            }
            onClick={() =>
              preferences.setInspector(
                preferences.inspector === "hidden" ? "open" : "hidden",
              )
            }
          >
            Inspector
          </button>
          <button
            aria-label={
              preferences.inspector === "compact"
                ? "Expand inspector"
                : "Minimize inspector"
            }
            disabled={preferences.inspector === "hidden"}
            onClick={() =>
              preferences.setInspector(
                preferences.inspector === "compact" ? "open" : "compact",
              )
            }
          >
            {preferences.inspector === "compact" ? "▣" : "▥"}
          </button>
          <button disabled={!s.doc || Boolean(loadingMap)} onClick={s.save}>
            <Icon name="save" />
            Save
          </button>
          <button
            className="le-primary"
            disabled={!s.doc || !source || Boolean(loadingMap)}
            onClick={() =>
              layoutAction(() => {
                if (s.doc && source) {
                  download(
                    `${source.map_id}_colliders.json`,
                    mapExport({ ...source, authored_layout: s.doc }),
                  );
                  useLayoutStore.setState({
                    status:
                      "Server map exported. Install in avenlab-server/src/assets/blocks, run scripts/sync-world-builder-map.mjs, rebuild the frontend and restart Rust.",
                  });
                }
              })
            }
          >
            <Icon name="export" />
            Export map
          </button>
        </div>
      </aside>}
      <div
        className="le-body"
        inert={Boolean(confirm || preview || loadingMap)}
      >
        <aside className="le-library" id="world-prefab-sidebar" hidden={!preferences.libraryVisible}>
          <div className="le-section-title">
            <span>PREFAB LIBRARY</span>
            <span>
              {library.length} / {PIECES.length}
            </span>
          </div>
          <label className="le-search">
            <Icon name="search" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search prefabs…"
              aria-label="Search pieces"
            />
          </label>
          <LibraryTabs active={category} onChange={setCategory} />
          {category==='boats'&&<p role="status" className="px-3 py-2 text-xs text-cyan-200/85">
            HAWAII ROUTE · {navalRoute.length} waypoint{navalRoute.length===1?'':'s'} recorded in placement order. Select SEA LEVEL for the water path. Autopilot replay is not active yet.
          </p>}
          <div
            className="le-palette"
            id="world-prefab-library"
            role="tabpanel"
            aria-label={`${category} prefabs`}
          >
            {library.map((piece) => (
              <div className="le-piece-card" key={piece.id}>
                <button
                  className={`le-piece ${s.placing === piece.id ? "is-current" : ""}`}
                  title={piece.description}
                  aria-label={`Place ${piece.label}`}
                  aria-pressed={s.placing === piece.id}
                  disabled={!s.doc}
                  onClick={() => choose(piece)}
                >
                  <PrefabPortrait piece={piece} />
                  <span>{piece.label}</span>
                  <small>
                    {Number(piece.size[0].toFixed(2))} ×{" "}
                    {Number(piece.size[2].toFixed(2))} m
                  </small>
                  <span className="le-piece-add">+</span>
                </button>
                <button
                  className="le-preview-button"
                  aria-label={`Preview ${piece.label}`}
                  onClick={() => setPreview(piece.id)}
                >
                  Preview
                </button>
              </div>
            ))}
            {!library.length && (
              <p className="le-empty-search">No prefabs match this search.</p>
            )}
          </div>
        </aside>
        <main className="le-stage">
          <div className="le-stage-top">
            <div className="le-views">
              <button
                aria-pressed={!planOnly && s.view === "3d"}
                disabled={planOnly}
                onClick={() => useLayoutStore.setState({ view: "3d" })}
              >
                Perspective
              </button>
              <button
                aria-pressed={planOnly || s.view === "plan"}
                onClick={() => useLayoutStore.setState({ view: "plan" })}
              >
                Plan
              </button>
            </div>
            <div className="le-stage-tag">
              <span /> Y UP · METRES
              {s.doc?.ground === false ? " · NO SUPPORT GROUND" : ""}
            </div>
          </div>
          <div className="le-tools" role="toolbar" aria-label="Edit tools">
            <button aria-label="Pan view" title="Pan view · left drag or one finger; right drag always pans" aria-pressed={s.navigation === "pan"} onClick={()=>useLayoutStore.setState({navigation:s.navigation === "pan"?"orbit":"pan",placing:null})}><Icon name="pan"/></button>
            {(["select", "translate", "rotate", "scale"] as const).map(
              (tool, i) => (
                <button
                  key={tool}
                  aria-label={`${tool === "translate" ? "Move" : tool[0].toUpperCase() + tool.slice(1)} tool`}
                  title={`${tool} · ${["V", "W", "R", "S"][i]}`}
                  aria-pressed={!s.placing && s.navigation !== "pan" && s.tool === tool}
                  onClick={() =>
                    useLayoutStore.setState({ tool, placing: null, navigation:"orbit" })
                  }
                >
                  <Icon name={tool} />
                </button>
              ),
            )}
            <span className="le-divider" />
            <button
              aria-label="Undo layout edit"
              title="Undo · Ctrl Z"
              disabled={!s.past.length}
              onClick={s.undo}
            >
              <Icon name="undo" />
            </button>
            <button
              aria-label="Redo layout edit"
              title="Redo · Ctrl Shift Z"
              disabled={!s.future.length}
              onClick={s.redo}
            >
              <Icon name="redo" />
            </button>
            <span className="le-divider" />
            <button
              aria-label="Fit layout"
              title="Fit · F"
              onClick={() =>
                useLayoutStore.setState({
                  focus: "layout",
                  cameraRevision: s.cameraRevision + 1,
                })
              }
            >
              <Icon name="fit" />
            </button>
          </div>
          {(planOnly || s.view === "plan") && (
            <LayoutPlan key={s.cameraRevision} />
          )}
          {!source && (
            <div className="le-stage-message">
              <Icon name="layers" />
              <strong>Opening world</strong>
              <p>{sourceStatus}</p>
              <button onClick={() => void loadStandaloneBuilder()}>
                Retry source
              </button>
            </div>
          )}
          {source &&
            s.doc?.base !== "overlay" &&
            !s.doc?.objects.length &&
            !s.placing && (
              <div className="le-stage-message le-welcome">
                <strong>Empty layout</strong>
                <p>Choose a prefab, then place it on the grid.</p>
                <button onClick={() => projectAction("example")}>
                  Explore an example block <span>↗</span>
                </button>
              </div>
            )}
          <div className="le-stage-bottom">
            <div className="le-grid-control">
              <span>LEVEL</span>
              <select
                aria-label="Construction level"
                value={s.placementLevel}
                onChange={(e) => s.setPlacementLevel(e.target.value as typeof s.placementLevel)}
              >
                {LAYOUT_LEVELS.map((level) => (
                  <option key={level.id} value={level.id}>
                    {level.label} · {level.elevation >= 0 ? "+" : ""}{level.elevation}m
                  </option>
                ))}
              </select>
              <button
                title="Move the selected piece's base elevation to this construction plane"
                aria-label="Snap selected piece to construction level"
                disabled={!s.selected || !s.doc?.objects.find((object) => object.id === s.selected && !object.locked)}
                onClick={() => layoutAction(() => {
                  const object = s.doc?.objects.find((entry) => entry.id === s.selected);
                  if (object) useLayoutStore.getState().update({
                    position: [object.position[0], layoutLevel(s.placementLevel).elevation, object.position[2]],
                  });
                })}
              >
                SNAP Y
              </button>
              <span>GRID</span>
              <select
                aria-label="Grid snap"
                value={s.snap}
                onChange={(e) =>
                  useLayoutStore.setState({ snap: Number(e.target.value) })
                }
              >
                {[0.25, 0.5, 1, 2, 5].map((v) => (
                  <option key={v} value={v}>
                    {v} m
                  </option>
                ))}
              </select>
              <span>ANGLE</span>
              <select
                aria-label="Rotation snap"
                value={s.angleSnap}
                onChange={(e) =>
                  useLayoutStore.setState({ angleSnap: Number(e.target.value) })
                }
              >
                {[5, 15, 45, 90].map((v) => (
                  <option key={v} value={v}>
                    {v}°
                  </option>
                ))}
              </select>
            </div>
            <button
              className="le-camera"
              disabled={planOnly || s.view === "plan"}
              onClick={() =>
                useLayoutStore.setState({
                  camera: s.camera === "iso" ? "top" : "iso",
                  cameraRevision: s.cameraRevision + 1,
                })
              }
            >
              {s.camera === "iso" ? "↗ Isometric" : "↓ Top view"}
            </button>
          </div>
          <div className="le-stage-help">
            {s.placing ? (
              <>
                <kbd>CLICK</kbd> place <kbd>Q / E</kbd> turn <kbd>PGUP / PGDN</kbd> floor <kbd>SHIFT</kbd> ×10 <kbd>ESC</kbd>{" "}
                finish
              </>
            ) : planOnly || s.view === "plan" ? (
              <>
                <kbd>DRAG</kbd> move with W <kbd>RIGHT DRAG</kbd> pan{" "}
                <kbd>SCROLL</kbd> zoom
              </>
            ) : (
              <>
                <kbd>DRAG</kbd> orbit <kbd>RIGHT DRAG</kbd> pan{" "}
                <kbd>SCROLL</kbd> zoom
              </>
            )}
          </div>
        </main>
        {presentation !== "hud" && preferences.inspector !== "hidden" && (
          <LayoutInspector
            planOnly={planOnly}
            modelReference={modelReference}
            setPreview={setPreview}
            projectAction={projectAction}
            importFile={importFile}
            exportLayout={() =>
              layoutAction(() => {
                if (s.doc)
                  download(`${s.doc.map_id}.layout.json`, layoutJSON(s.doc));
              })
            }
          />
        )}
      </div>
      <footer className="le-footer">
        <span className="le-status-dot" />
        <output role="status">{s.status}</output>
        <span className="le-footer-map">
          {s.doc?.map_id ?? "AVENLAB"}
          <span> / </span>
          {s.doc?.objects.length ?? 0} PIECES
        </span>
      </footer>
      {preview && (
        <Suspense fallback={null}>
          <PiecePreview
            pieceId={preview}
            onClose={() => setPreview(null)}
            onPlace={() => {
              const piece = pieceById(preview);
              if (piece) choose(piece);
              setPreview(null);
            }}
          />
        </Suspense>
      )}
      {confirm && (
        <div className="le-modal-backdrop">
          <section
            role="dialog"
            aria-modal="true"
            aria-label="Replace layout"
            className="le-modal"
          >
            <span className="le-small-label">A FRESH CANVAS</span>
            <h2>
              {confirm === "new"
                ? "Start a new layout?"
                : "Explore the example?"}
            </h2>
            <p>Your current layout will be replaced. Undo brings it back.</p>
            <div className="le-twin">
              <button autoFocus onClick={() => setConfirm(null)}>
                Keep working
              </button>
              <button
                className="le-primary"
                onClick={() => {
                  layoutAction(() =>
                    s.newLayout(confirm === "example", source?.surface.road_y),
                  );
                  setConfirm(null);
                }}
              >
                {confirm === "new" ? "Start fresh" : "Load example"}
              </button>
            </div>
          </section>
        </div>
      )}
    </section>
  );
}
export function WorldBuilderPanel({
  planOnly = false,
  modelReference = true,
}: {
  planOnly?: boolean;
  modelReference?: boolean;
}) {
  const workspace = useBuilderStore((s) => s.workspace);
  if (workspace === "vehicle") return <VehicleEditorPanel />;
  return workspace === "colliders" ? (
    <CollisionBuilderPanel planOnly={planOnly || !modelReference} />
  ) : (
    <LayoutPanel planOnly={planOnly} modelReference={modelReference} />
  );
}
