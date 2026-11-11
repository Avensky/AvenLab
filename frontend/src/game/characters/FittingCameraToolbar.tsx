import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { FittingRotationControls } from "./FittingRotationControls";
import "./fittingCameraToolbar.css";

const ICON_PATHS = {
  camera: "M3 6h4l2-3h6l2 3h4v14H3z M16 13a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z",
  zoomOut: "M14 10a5 5 0 1 1-10 0 5 5 0 0 1 10 0Z M13 14l6 6 M7 10h4",
  zoomIn: "M14 10a5 5 0 1 1-10 0 5 5 0 0 1 10 0Z M13 14l6 6 M7 10h4m-2-2v4",
  hold: "M9 5v14m6-14v14",
  resume: "m9 5 10 7-10 7z",
  reframe: "M3 8V3h5m8 0h5v5m0 8v5h-5m-8 0H3v-5m9-7v6m-3-3h6",
} as const;

function ToolIcon({ icon }: { icon: keyof typeof ICON_PATHS }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={ICON_PATHS[icon]} /></svg>;
}

export function FittingCameraToolbar({ camera, zoomRange, visibility, paused, onPause, onZoomOut, onZoomIn,
  zoomOutDisabled, zoomInDisabled, onReframe, vehicle = false, rotationDisabled = false }: {
  camera: ReactNode;
  zoomRange?: ReactNode;
  visibility: ReactNode;
  paused: boolean;
  onPause: () => void;
  onZoomOut: () => void;
  onZoomIn: () => void;
  zoomOutDisabled?: boolean;
  zoomInDisabled?: boolean;
  onReframe?: () => void;
  vehicle?: boolean;
  rotationDisabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const toggle = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const focusCamera = useRef(false);

  useEffect(() => {
    if (!open) return;
    if (focusCamera.current) panel.current?.querySelector("select")?.focus();
    function dismiss(event: MouseEvent) {
      const target = event.target as Node | null;
      if (!toggle.current?.contains(target) && !panel.current?.contains(target)) setOpen(false);
    }
    document.addEventListener("click", dismiss, true);
    return () => document.removeEventListener("click", dismiss, true);
  }, [open]);

  const pauseLabel = paused ? "Resume pose" : "Hold pose";
  return <div className="fitting-camera-toolbar" role="group" aria-label="Character camera tools" onKeyDownCapture={event => {
    if (!open || event.key !== "Escape") return;
    event.preventDefault();
    event.stopPropagation();
    setOpen(false);
    toggle.current?.focus();
  }}>
    <div className="fitting-camera-panel" id={panelId} hidden={!open} ref={panel}>
      <div className="fitting-camera-preset" data-controller-row>
        {camera}
        {onReframe && <button type="button" className="menu-control fitting-tool-icon" aria-label="Reframe" title="Reframe" onClick={onReframe}><ToolIcon icon="reframe" /></button>}
      </div>
      {zoomRange && <div className="fitting-camera-range" data-controller-row>{zoomRange}</div>}
      <FittingRotationControls compact vehicle={vehicle} disabled={rotationDisabled} />
    </div>
    <div className="fitting-camera-row" data-controller-row>
      <button ref={toggle} type="button" className="menu-control fitting-tool-icon" aria-label="Camera tools" aria-controls={panelId}
        aria-expanded={open} title="Camera views and rotation" onClick={event => { focusCamera.current = event.detail === 0; setOpen(!open); }}><ToolIcon icon="camera" /></button>
      <button type="button" className="menu-control fitting-tool-icon" aria-label="Zoom out" title="Zoom out" disabled={zoomOutDisabled} onClick={onZoomOut}><ToolIcon icon="zoomOut" /></button>
      <button type="button" className="menu-control fitting-tool-icon" aria-label="Zoom in" title="Zoom in" disabled={zoomInDisabled} onClick={onZoomIn}><ToolIcon icon="zoomIn" /></button>
      <button type="button" className="menu-control fitting-tool-icon" aria-label={pauseLabel} title={pauseLabel} aria-pressed={paused} onClick={onPause}><ToolIcon icon={paused ? "resume" : "hold"} /></button>
      {visibility}
    </div>
  </div>;
}
