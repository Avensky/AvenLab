import { useEffect } from "react";
import { COCKPIT_TEST_VEHICLE } from "../characters/cockpitEmotes";
import { garageCamera, useGarageDrive, type DriveStage } from "./garageDriveStore";
import { PreviewZoom } from "./PreviewZoom";

const stageLabel: Record<DriveStage, string> = {
  idle: "", opening: "Opening door", entering: "Getting in", closing: "Closing door",
  driving: "Driving out", finished: "Parked",
};

export function GaragePreviewControls({ vehicle }: { vehicle: string }) {
  const { stage, ready, error, nextCamera, start, reset } = useGarageDrive();
  const camera = useGarageDrive(garageCamera);
  const ae86 = vehicle === COCKPIT_TEST_VEHICLE;
  const active = stage !== "idle";
  useEffect(() => () => reset(), [reset, vehicle]);

  return <div className="hero-garage-zoom">
    {ae86 && (error || active) && <span className="garage-drive-status" role="status">{error || stageLabel[stage]}</span>}
    <PreviewZoom />
    <div className="garage-preview-buttons" role="group" aria-label="Garage camera and drive preview" data-controller-row>
      <button type="button" className="menu-control" aria-label={`Switch garage camera. Current view: ${camera}`}
        onClick={() => nextCamera(ae86)}>Camera · {camera}</button>
      {ae86 && (active
        ? <button type="button" className="menu-control" onClick={reset}>Reset</button>
        : <button type="button" className="menu-control" disabled={!ready}
            title={ready ? undefined : "Drive Out requires a loaded driver, empty hands, and motion enabled."}
            onClick={start}>Drive Out</button>)}
      {ae86 && stage === "finished" && <>
        <button type="button" className="menu-control" aria-label="Steer left"
          onClick={() => useGarageDrive.setState({ steering: { id: "199" }, camera: "Cockpit" })}>← Steer</button>
        <button type="button" className="menu-control" aria-label="Steer right"
          onClick={() => useGarageDrive.setState({ steering: { id: "200" }, camera: "Cockpit" })}>Steer →</button>
      </>}
    </div>
  </div>;
}
