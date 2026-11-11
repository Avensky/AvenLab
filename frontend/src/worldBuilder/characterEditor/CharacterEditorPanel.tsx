import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { SceneTabHeader } from "../../components/menus/SceneTabHeader";
import { CHARACTER_TABS, CharacterPage, type CharacterTab } from "../../game/characters/CharacterPage";
import { useCharacterPreviewStore } from "../../game/characters/characterPreviewStore";
import { FittingCameraSelect } from "../../game/characters/FittingCameraSelect";
import { FittingCameraToolbar } from "../../game/characters/FittingCameraToolbar";
import { PreviewVisibilityToggle } from "../../game/preview/PreviewVisibilityToggle";
import { navigateFormRows } from "../../game/social/formRows";
import { useSelectionNavigation } from "../../game/alpha/useSelectionNavigation";
import { useSocialStore } from "../../store/social/socialStore";
import { CHARACTER_SHOTS, leaveCharacterEditor, useCharacterEditorStore } from "./characterEditorStore";
import "./characterEditor.css";

export function CharacterEditorPanel() {
  const root = useRef<HTMLElement>(null), beforeClose = useRef<() => Promise<boolean>>(null);
  const remembered = useRef(new WeakMap<HTMLElement, number>()), leaving = useRef(false);
  const owner = useSocialStore(s => s.view?.profile.id ?? s.profileOwner ?? "guest");
  const [tab, setTab] = useState<CharacterTab>("appearance"), [ready, setReady] = useState(false), [busy, setBusy] = useState(false);
  const { choice, shot, frame, preview, panelsHidden } = useCharacterEditorStore();
  const paused = useCharacterPreviewStore(s => s.playbackPaused);
  const focusRevision = useCharacterPreviewStore(s => s.focusRevision);
  const automaticCamera = useCharacterPreviewStore(s => s.camera);
  useLayoutEffect(() => {
    const element = root.current?.querySelector<HTMLElement>("[data-character-viewport]");
    if (!element) return;
    const update = () => {
      const { left, top, width, height } = element.getBoundingClientRect();
      useCharacterEditorStore.setState({ viewport: { left, top, width, height } });
    };
    const observer = new ResizeObserver(update);
    observer.observe(element);
    update();
    return () => observer.disconnect();
  }, [tab, ready, panelsHidden]);
  const back = useCallback(async () => {
    if (useCharacterEditorStore.getState().panelsHidden) {
      useCharacterEditorStore.setState({ panelsHidden: false });
      return;
    }
    if (leaving.current) return;
    leaving.current = true;
    setBusy(true);
    try { if (await beforeClose.current?.() !== false) leaveCharacterEditor(); }
    finally { leaving.current = false; setBusy(false); }
  }, []);
  useEffect(() => {
    const close = () => void back();
    window.addEventListener("avenlab:character-editor-close", close);
    root.current?.focus({ preventScroll: true });
    return () => {
      window.removeEventListener("avenlab:character-editor-close", close);
      useCharacterPreviewStore.setState({ playbackPaused: false, automaticEmotes: true });
    };
  }, [back]);
  useEffect(() => { frame(automaticCamera === "Whole car" ? "Full body" : automaticCamera); }, [automaticCamera, focusRevision, frame]);
  useSelectionNavigation(root, {
    back: () => void back(),
    confirm: () => { const active = document.activeElement as HTMLElement; if (root.current?.contains(active)) active.click(); },
    direction: action => {
      const active = document.activeElement as HTMLElement;
      if (active instanceof HTMLSelectElement && ["left", "right"].includes(action)) {
        active.selectedIndex = (active.selectedIndex + (action === "left" ? -1 : 1) + active.options.length) % active.options.length;
        active.dispatchEvent(new Event("change", { bubbles: true }));
      } else if (root.current) navigateFormRows(root.current, active, action, remembered.current);
    },
    tab: step => {
      if (!ready || panelsHidden) return;
      const index = CHARACTER_TABS.findIndex(item => item.id === tab);
      setTab(CHARACTER_TABS[(index + step + CHARACTER_TABS.length) % CHARACTER_TABS.length].id);
    },
  });
  const zoomBy = (step: number) => useCharacterEditorStore.setState(s => ({ zoomSteps: s.zoomSteps + step }));
  const togglePose = () => useCharacterPreviewStore.setState({ playbackPaused: !paused });
  const visibility = <PreviewVisibilityToggle hidden={panelsHidden} onToggle={() => useCharacterEditorStore.setState({ panelsHidden: !panelsHidden })} />;
  const cameraSelect = <FittingCameraSelect choice={choice} views={CHARACTER_SHOTS} view={shot} onViewChange={frame} label="Character close-up" />;
  const cameraTools = <FittingCameraToolbar key={tab} camera={cameraSelect} visibility={visibility} paused={paused} onPause={togglePose}
    onZoomOut={() => zoomBy(-1)} onZoomIn={() => zoomBy(1)} onReframe={() => frame(shot)} />;
  return <section ref={root} tabIndex={-1} data-controller-form data-controller-rows
    className={`game-ui menu-surface character-editor${panelsHidden ? " character-editor--hidden" : ""}`} aria-label="Character editor">
    <div className="character-editor-header">
      <SceneTabHeader title="CHARACTER" compact tabs={ready ? CHARACTER_TABS : []} activeTab={tab}
        character={{readOnly: true, compact: true}}
        onTabChange={value => setTab(value as CharacterTab)} panelId="character-editor-panel" idPrefix="character-editor" busy={busy}
        actions={<div data-controller-row><button type="button" className="menu-control controller-shortcut-back" disabled={busy}
          onClick={() => void back()}>{busy ? "Saving…" : "Back"}</button></div>} />
    </div>
    <CharacterPage key={owner} inspection onPreview={preview} onReady={setReady} tab={tab} beforeClose={beforeClose} cameraControls={cameraTools} />
  </section>;
}
