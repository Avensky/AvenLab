import { VehicleScene } from "../../vehicles/VehicleScene";
import { CityScene } from "../../world";
import { FirstFrameReady } from "./tools/FirstFrameReady";

export function Sandbox() {
  return (<>
    <FirstFrameReady />
    <VehicleScene />
    <CityScene />
  </>);
}