import { useEffect } from "react";
import type { VehicleModelId } from "../../vehicles/tools/vehicleModelPaths";
import { GARAGE_STATIONS } from "./garageStations";
import { GARAGE_CAMERAS, garageCamera, useGarageDrive, type DriveStage, type GarageCamera } from "./garageDriveStore";
import { cockpitTakesForWheel, type CockpitTake } from "../characters/cockpitEmotes";
import { unlockVehicleAudio } from "../../audio/sharedAudio";
import { useVehicleStudioStore } from "../heroes/vehicleStudioStore";
import { PreviewVisibilityToggle } from "./PreviewVisibilityToggle";
import { PreviewCameraAngles, PreviewControlDisclosure } from "./PreviewControlDisclosure";
import { PreviewCameraSelect } from "./PreviewCameraSelect";
import { PreviewToolIcon } from "./PreviewToolIcon";

const stageLabel: Record<DriveStage, string> = {
  idle: "", station: "At the controls", opening: "Opening door", entering: "Getting in", closing: "Closing door",
  driving: "Driving out", finished: "Parked",
};

export function GaragePreviewControls({ vehicle }: { vehicle: VehicleModelId }) {
  const { stage, ready, error, enterStation, start, reset, leaveVehicle } = useGarageDrive();
  const camera = useGarageDrive(garageCamera);
  const station = GARAGE_STATIONS[vehicle];
  const canSteer = station.kind === "wheel" && Boolean(station.steeringParts);
  const canDriveOut = vehicle === "ae86";
  const active = stage !== "idle";
  const cameraViews: readonly GarageCamera[] = station.kind === "wheel" ? GARAGE_CAMERAS : GARAGE_CAMERAS.filter(view => view !== "Dashboard");
  useEffect(() => () => leaveVehicle(), [leaveVehicle]);

  function playGesture(id: CockpitTake["id"]) {
    if (id === "drive-honk") unlockVehicleAudio();
    useGarageDrive.setState({ steering: { id }, camera: "Cockpit" });
  }

  return <div className="hero-garage-controls">
    {(error || active) && <span className="garage-drive-status" role="status">{error || stageLabel[stage]}</span>}
    <div className="fitting-camera-toolbar fitting-camera-row" role="group" aria-label="Garage camera and drive preview" data-controller-row>
      <PreviewCameraAngles>
        <PreviewCameraSelect views={cameraViews} view={cameraViews.includes(camera) ? camera : "Showroom"}
          onViewChange={view => useGarageDrive.setState({ camera: view })} />
      </PreviewCameraAngles>
      <PreviewControlDisclosure label="Drive preview controls" icon={<PreviewToolIcon icon="adjustments" />}>
        <div className="garage-preview-buttons" data-controller-row>
      {active ? <button type="button" className="menu-control" onClick={reset}>Reset</button> : <>
        <button type="button" className="menu-control" disabled={!ready}
          title={ready ? undefined : "Requires a loaded driver, motion enabled."}
          onClick={() => { useVehicleStudioStore.getState().closeParts(); enterStation(); }}>{station.kind === "bridge" ? "Enter bridge" : station.kind === "levers" ? "Driver station" : "Enter cockpit"}</button>
        {canDriveOut && <button type="button" className="menu-control" disabled={!ready} onClick={() => { useVehicleStudioStore.getState().closeParts(); start(); }}>Drive Out</button>}
      </>}
      {canSteer && (stage === "station" || stage === "finished") && <>
        <button type="button" className="menu-control" aria-label="Steer left"
          onClick={() => useGarageDrive.setState({ steering: { id: "199" }, camera: "Cockpit" })}>← Steer</button>
        <button type="button" className="menu-control" aria-label="Steer right"
          onClick={() => useGarageDrive.setState({ steering: { id: "200" }, camera: "Cockpit" })}>Steer →</button>
      </>}
      {station.kind === "wheel" && (stage === "station" || stage === "finished") &&
        <select className="menu-control" value="" aria-label="Driver gesture"
          onChange={event => playGesture(event.target.value as CockpitTake["id"])}>
          <option value="" disabled>Driver gestures</option>
          {cockpitTakesForWheel(canSteer, Boolean(station.drivingSet)).filter(take => take.id.startsWith("drive-")).map(take =>
            <option key={take.id} value={take.id}>{take.name}</option>)}
        </select>}
        </div>
      </PreviewControlDisclosure>
      <PreviewVisibilityToggle />
    </div>
  </div>;
}
