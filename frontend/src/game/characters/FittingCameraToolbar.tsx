import type { ReactNode } from "react";
import { PreviewCameraAngles, PreviewControlDisclosure } from "../preview/PreviewControlDisclosure";
import { PreviewToolButton } from "../preview/PreviewToolButton";
import { PreviewToolIcon } from "../preview/PreviewToolIcon";
import { FittingRotationControls } from "./FittingRotationControls";

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
    {onZoomOut && <PreviewToolButton label="Zoom out" disabled={zoomOutDisabled} onClick={onZoomOut}><PreviewToolIcon icon="zoomOut" /></PreviewToolButton>}
    {onZoomIn && <PreviewToolButton label="Zoom in" disabled={zoomInDisabled} onClick={onZoomIn}><PreviewToolIcon icon="zoomIn" /></PreviewToolButton>}
  </div>;
  const adjustments = (!rotationDisabled || onReframe || zoomControls) && <div className="fitting-camera-adjustments">
    {zoomControls}
    {!rotationDisabled && <FittingRotationControls compact vehicle={vehicle} />}
    {onReframe && <div data-controller-row><PreviewToolButton label="Reframe" onClick={onReframe}><PreviewToolIcon icon="reframe" /></PreviewToolButton></div>}
  </div>;
  return <div className="fitting-camera-toolbar" role="group" aria-label="Character camera tools">
    <div className="fitting-camera-row" data-controller-row>
      {splitCamera && camera && <PreviewCameraAngles>{camera}</PreviewCameraAngles>}
      {((!splitCamera && camera) || adjustments || (splitCamera && actions)) && <PreviewControlDisclosure label="Camera tools" icon={<PreviewToolIcon icon={splitCamera ? "adjustments" : "camera"} />}>
        {!splitCamera && camera}{adjustments}{splitCamera && actions}
      </PreviewControlDisclosure>}
      <PreviewToolButton label={pauseLabel} aria-pressed={paused} onClick={onPause}><PreviewToolIcon icon={paused ? "resume" : "hold"} /></PreviewToolButton>
      {visibility}
      {!splitCamera && actions}
    </div>
  </div>;
}
