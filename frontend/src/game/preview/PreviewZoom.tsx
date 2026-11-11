import { PREVIEW_ZOOM_LEVELS, usePreviewZoom } from "./previewZoomStore";
import { PreviewVisibilityToggle } from "./PreviewVisibilityToggle";

export function PreviewZoom({ visibilityToggle = false }: { visibilityToggle?: boolean }) {
  const level = usePreviewZoom(state => state.level);
  return <div className="hero-preview-zoom" role="group" aria-label="Vehicle preview zoom" data-controller-row>
    <button type="button" className="menu-control" aria-label="Zoom vehicle out" disabled={level === 0}
      onClick={() => usePreviewZoom.setState({ level: level - 1 })}>−</button>
    <button type="button" className="menu-control" aria-label="Reset vehicle zoom" disabled={level === 0}
      onClick={() => usePreviewZoom.setState({ level: 0 })}>{Math.round(PREVIEW_ZOOM_LEVELS[level] * 100)}%</button>
    <button type="button" className="menu-control" aria-label="Zoom vehicle in" disabled={level === PREVIEW_ZOOM_LEVELS.length - 1}
      onClick={() => usePreviewZoom.setState({ level: level + 1 })}>+</button>
    {visibilityToggle && <PreviewVisibilityToggle />}
  </div>;
}
