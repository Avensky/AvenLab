import { useEffect, useState } from "react";
import { performanceRecorder as recorder } from "./measurements";

function read() {
  return { ...recorder.live(), status: recorder.status, capturing: recorder.capturing,
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
