import type { ReactNode } from "react";
import { PreviewControlDisclosure } from "../preview/PreviewControlDisclosure";
import { PreviewToolButton } from "../preview/PreviewToolButton";
import { FittingRotationControls } from "./FittingRotationControls";
import "./fittingCameraToolbar.css";

const ICON_PATHS = {
  camera: "M3 6h4l2-3h6l2 3h4v14H3z M16 13a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z",
  adjustments: "M4 6h16M4 12h16M4 18h16M8 3v6m8 0v6m-7 0v6",
  zoomOut: "M14 10a5 5 0 1 1-10 0 5 5 0 0 1 10 0Z M13 14l6 6 M7 10h4",
  zoomIn: "M14 10a5 5 0 1 1-10 0 5 5 0 0 1 10 0Z M13 14l6 6 M7 10h4m-2-2v4",
  hold: "M9 5v14m6-14v14",
  resume: "m9 5 10 7-10 7z",
  reframe: "M3 8V3h5m8 0h5v5m0 8v5h-5m-8 0H3v-5m9-7v6m-3-3h6",
} as const;

export function ToolIcon({ icon }: { icon: keyof typeof ICON_PATHS }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={ICON_PATHS[icon]} /></svg>;
}

export function FittingCameraToolbar({ camera, visibility, actions, paused, onPause, onZoomOut, onZoomIn,
  zoomOutDisabled, zoomInDisabled, onReframe, vehicle = false, rotationDisabled = false, splitCamera = false }: {
  camera?: ReactNode;
  visibility: ReactNode;
  actions?: ReactNode;
  paused: boolean;
  onPause: () => void;
  onZoomOut?: () => void;
  onZoomIn?: () => void;
  zoomOutDisabled?: boolean;
  zoomInDisabled?: boolean;
  onReframe?: () => void;
  vehicle?: boolean;
  rotationDisabled?: boolean;
  splitCamera?: boolean;
}) {
  const pauseLabel = paused ? "Resume pose" : "Hold pose";
  const zoomControls = (onZoomOut || onZoomIn) && <div className="fitting-camera-range" role="group" aria-label="Camera zoom" data-controller-row>
    {onZoomOut && <PreviewToolButton label="Zoom out" disabled={zoomOutDisabled} onClick={onZoomOut}><ToolIcon icon="zoomOut" /></PreviewToolButton>}
    {onZoomIn && <PreviewToolButton label="Zoom in" disabled={zoomInDisabled} onClick={onZoomIn}><ToolIcon icon="zoomIn" /></PreviewToolButton>}
  </div>;
  const adjustments = (!rotationDisabled || onReframe || zoomControls) && <div className="fitting-camera-adjustments">
    {zoomControls}
    {!rotationDisabled && <FittingRotationControls compact vehicle={vehicle} />}
    {onReframe && <div data-controller-row><PreviewToolButton label="Reframe" onClick={onReframe}><ToolIcon icon="reframe" /></PreviewToolButton></div>}
  </div>;
  return <div className="fitting-camera-toolbar" role="group" aria-label="Character camera tools">
    <div className="fitting-camera-row" data-controller-row>
      {splitCamera && camera && <PreviewControlDisclosure label="Camera angles" icon={<ToolIcon icon="camera" />} panelClass="fitting-camera-panel fitting-camera-angles">{camera}</PreviewControlDisclosure>}
      {((!splitCamera && camera) || adjustments || (splitCamera && actions)) && <PreviewControlDisclosure label="Camera tools" icon={<ToolIcon icon={splitCamera ? "adjustments" : "camera"} />}>
        {!splitCamera && camera}{adjustments}{splitCamera && actions}
      </PreviewControlDisclosure>}
      <PreviewToolButton label={pauseLabel} aria-pressed={paused} onClick={onPause}><ToolIcon icon={paused ? "resume" : "hold"} /></PreviewToolButton>
      {visibility}
      {!splitCamera && actions}
    </div>
  </div>;
}
