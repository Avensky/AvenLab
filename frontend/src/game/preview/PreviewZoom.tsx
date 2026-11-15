import { PREVIEW_ZOOM_LEVELS, usePreviewZoom } from "./previewZoomStore";
import { PreviewVisibilityToggle } from "./PreviewVisibilityToggle";
import { PreviewZoomSlider } from "./PreviewZoomSlider";

export function PreviewZoom({ visibilityToggle = false, vertical = false }: { visibilityToggle?: boolean; vertical?: boolean }) {
  const level = usePreviewZoom(state => state.level);
  const setLevel = (level: number) => usePreviewZoom.setState({ level });
  const percent = `${Math.round(PREVIEW_ZOOM_LEVELS[level] * 100)}%`;
  const zoomOut = <button type="button" className="menu-control" aria-label="Zoom vehicle out" disabled={level === 0}
    onClick={() => setLevel(level - 1)}>−</button>;
  const reset = <button type="button" className="menu-control" aria-label="Reset vehicle zoom" disabled={level === 0}
    onClick={() => setLevel(0)}>{percent}</button>;
  const zoomIn = <button type="button" className="menu-control" aria-label="Zoom vehicle in" disabled={level === PREVIEW_ZOOM_LEVELS.length - 1}
    onClick={() => setLevel(level + 1)}>+</button>;
  return <div className={`hero-preview-zoom${vertical ? " hero-preview-zoom--vertical" : ""}`} role="group"
    aria-label="Vehicle preview zoom" data-controller-row data-controller-columns={vertical ? 1 : undefined}>
    {vertical ? <>
      {zoomIn}
      <PreviewZoomSlider label="Zoom vehicle" min={0} max={PREVIEW_ZOOM_LEVELS.length - 1} step={1}
        value={level} valueText={percent} onChange={setLevel} />
      {zoomOut}{reset}
    </> : <>{zoomOut}{reset}{zoomIn}</>}
    {visibilityToggle && <PreviewVisibilityToggle />}
  </div>;
}
