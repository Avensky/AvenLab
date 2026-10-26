import { useEffect, useState } from "react";
import { performanceRecorder as recorder } from "./measurements";
import { useNetworkStore } from "../store/networkStore";
import { useWorldStore } from "../store/worldStore";
import { playerLocation } from "./location";

function read() {
  return { ...recorder.live(), status: recorder.status, capturing: recorder.capturing, progress: recorder.progress(), storageStatus: recorder.storageStatus,
    location: playerLocation(useNetworkStore.getState().getMe(), useWorldStore.getState().map),
    runs: [...recorder.runs], baselineId: recorder.baselineId };
}
export function usePerformanceReadout() {
  const [value, setValue] = useState(read);
  useEffect(() => {
    const timer = window.setInterval(() => setValue(read()), 250);
    return () => window.clearInterval(timer);
  }, []);
  return value;
}
