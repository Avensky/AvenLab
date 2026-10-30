import { create } from "zustand";
export const MAP_UPDATE_HZ = 10;
type MapPose = { x: number | null; z: number | null; yaw: number | null };
export const useMapTelemetryStore = create<MapPose>(() => ({
  x: null,
  z: null,
  yaw: null,
}));
let lastSample = -Infinity;
/** Shares the existing HUD sampler: no second timer and no raw network subscriber. */
export function sampleMapTelemetry(
  data: {
    positionX: number | null;
    positionZ: number | null;
    yawDeg: number | null;
  },
  now: number,
) {
  if (now >= lastSample && now - lastSample < 1000 / MAP_UPDATE_HZ) return;
  lastSample = now;
  const previous = useMapTelemetryStore.getState();
  if (
    previous.x !== data.positionX ||
    previous.z !== data.positionZ ||
    previous.yaw !== data.yawDeg
  )
    useMapTelemetryStore.setState({
      x: data.positionX,
      z: data.positionZ,
      yaw: data.yawDeg,
    });
}
