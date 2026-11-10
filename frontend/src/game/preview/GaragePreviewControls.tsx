import { useEffect } from "react";
import type { VehicleModelId } from "../../vehicles/tools/vehicleModelPaths";
import { GARAGE_STATIONS } from "./garageStations";
import { garageCamera, useGarageDrive, type DriveStage } from "./garageDriveStore";
import { PreviewZoom } from "./PreviewZoom";

const stageLabel: Record<DriveStage, string> = {
  idle: "", station: "At the controls", opening: "Opening door", entering: "Getting in", closing: "Closing door",
  driving: "Driving out", finished: "Parked",
};

export function GaragePreviewControls({ vehicle }: { vehicle: VehicleModelId }) {
  const { stage, ready, error, nextCamera, enterStation, start, reset } = useGarageDrive();
  const camera = useGarageDrive(garageCamera);
  const station = GARAGE_STATIONS[vehicle];
  const canSteer = station.kind === "wheel" && Boolean(station.steeringParts);
  const canDriveOut = vehicle === "ae86";
  const active = stage !== "idle";
  useEffect(() => () => reset(), [reset, vehicle]);

  return <div className="hero-garage-zoom">
    {(error || active) && <span className="garage-drive-status" role="status">{error || stageLabel[stage]}</span>}
    <PreviewZoom />
    <div className="garage-preview-buttons" role="group" aria-label="Garage camera and drive preview" data-controller-row>
      <button type="button" className="menu-control" aria-label={`Switch garage camera. Current view: ${camera}`}
        onClick={nextCamera}>Camera · {camera}</button>
      {active ? <button type="button" className="menu-control" onClick={reset}>Reset</button> : <>
        <button type="button" className="menu-control" disabled={!ready}
          title={ready ? undefined : "Requires a loaded driver, empty hands, and motion enabled."}
          onClick={enterStation}>{station.kind === "bridge" ? "Enter bridge" : station.kind === "levers" ? "Driver station" : "Enter cockpit"}</button>
        {canDriveOut && <button type="button" className="menu-control" disabled={!ready} onClick={start}>Drive Out</button>}
      </>}
      {canSteer && (stage === "station" || stage === "finished") && <>
        <button type="button" className="menu-control" aria-label="Steer left"
          onClick={() => useGarageDrive.setState({ steering: { id: "199" }, camera: "Cockpit" })}>← Steer</button>
        <button type="button" className="menu-control" aria-label="Steer right"
          onClick={() => useGarageDrive.setState({ steering: { id: "200" }, camera: "Cockpit" })}>Steer →</button>
      </>}
    </div>
  </div>;
}
