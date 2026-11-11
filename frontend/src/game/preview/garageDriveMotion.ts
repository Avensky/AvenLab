import { MathUtils } from "three";
import type { DriveStage } from "./garageDriveStore";

export const DRIVE_OUT_DURATION = 6.7;
export const GARAGE_ENTRY_DURATION = 4.14;

export function sampleDriveOut(seconds: number) {
  const ease = (start: number, end: number) => MathUtils.smoothstep(seconds, start, end);
  const stage: DriveStage = seconds < 1.25 ? "opening" : seconds < 3.05 ? "entering"
    : seconds < 4.14 ? "closing" : seconds < DRIVE_OUT_DURATION ? "driving" : "finished";
  return {
    stage,
    door: ease(.38, 1.24) - ease(3.08, 3.86),
    turnToDoor: ease(0, .48),
    reachHandle: ease(.14, .42) - ease(1.12, 1.47),
    enter: MathUtils.clamp((seconds - 1.25) / 1.8, 0, 1),
    closeHandle: ease(2.98, 3.17) - ease(3.74, 4.07),
    travel: 3.9 * ease(4.14, DRIVE_OUT_DURATION),
    brake: ease(6, 6.6),
  };
}

export type DriveOutPose = ReturnType<typeof sampleDriveOut>;
