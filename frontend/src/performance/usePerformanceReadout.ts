import { useEffect, useState } from "react";
import { performanceRecorder as recorder, type Summaries } from "./measurements";
import { useNetworkStore } from "../store/networkStore";
import { useWorldStore } from "../store/worldStore";
import { playerLocation } from "./location";

function read(detailed: boolean) {
  // Compact mode does not sort every metric ring for invisible statistics.
  return { ...(detailed ? recorder.live() : { metrics: {} as Summaries, snapshotKiBps: 0, debugKiBps: 0, snapshotHz: 0 }), status: recorder.status, capturing: recorder.capturing, progress: recorder.progress(), storageStatus: recorder.storageStatus,
    location: detailed ? playerLocation(useNetworkStore.getState().getMe(), useWorldStore.getState().map) : null,
    runs: [...recorder.runs], baselineId: recorder.baselineId };
}
export function usePerformanceReadout(detailed = true) {
  const [value, setValue] = useState(() => read(detailed));
  useEffect(() => {
    const timer = window.setInterval(() => setValue(read(detailed)), 250);
    const unsubscribe = recorder.subscribeArchive(() => setValue(read(detailed)));
    return () => { window.clearInterval(timer); unsubscribe(); };
  }, [detailed]);
  return value;
}
