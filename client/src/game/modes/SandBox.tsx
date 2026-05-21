import { VehicleScene } from "../../vehicles/VehicleScene";
import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import { useUIStore } from "../../store";

function FirstFrameReady() {
  const done = useRef(false);

  useFrame(() => {
    if (done.current) return;
    done.current = true;

    window.setTimeout(() => {
      useUIStore.getState().finishModeLoading();
    }, 300);
  });

  return null;
}

export function Sandbox() {
  return (<>
    <FirstFrameReady />
    <VehicleScene />
  </>);
}