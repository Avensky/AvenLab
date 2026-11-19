import { MathUtils } from "three";
import type { DriveStage } from "./garageDriveStore";

export const DRIVE_OUT_DURATION = 6.7;
export const GARAGE_ENTRY_DURATION = 4.14;

export function sampleDriveOut(seconds: number) {
  const ease = (start: number, end: number) => MathUtils.smoothstep(seconds, start, end);
  const stage: DriveStage = seconds < 1.25 ? "opening" : seconds < 3.05 ? "entering"
    : seconds < GARAGE_ENTRY_DURATION ? "closing" : seconds < DRIVE_OUT_DURATION ? "driving" : "finished";
  // Establish the exterior grip before swinging the door, then release before entry.
  const closeDoor = ease(3.08, 3.86);
  return {
    stage,
    door: ease(.48, 1.16) - closeDoor,
    handlesDoor: ease(.13, .47) * (1 - ease(.78, 1.14)),
    faceDoor: ease(.02, .47),
    closeDoor,
    enter: MathUtils.clamp((seconds - 1.25) / 1.8, 0, 1),
    travel: 3.9 * ease(GARAGE_ENTRY_DURATION, DRIVE_OUT_DURATION),
    brake: ease(6, 6.6),
  };
}

export type DriveOutPose = ReturnType<typeof sampleDriveOut>;
