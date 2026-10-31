import { create } from "zustand";

/** The existing R3F frame probe feeds this tiny accumulator. Publish at most
 * twice per second; compact climate never starts a RAF, ping loop or profiler. */
export const useFrameReadout = create<{
  fps: number | null;
  frameMs: number | null;
}>(() => ({ fps: null, frameMs: null }));

let previous: number | null = null;
let elapsed = 0;
let frames = 0;
export function sampleHudFrame(now: number) {
  if (previous !== null && now > previous) {
    elapsed += now - previous;
    frames++;
    if (elapsed >= 500) {
      const frameMs = elapsed / frames;
      const value = {
        fps: Math.round(1000 / frameMs),
        frameMs: Math.round(frameMs * 10) / 10,
      };
      const current = useFrameReadout.getState();
      if (value.fps !== current.fps || value.frameMs !== current.frameMs)
        useFrameReadout.setState(value);
      elapsed = 0;
      frames = 0;
    }
  }
  previous = now;
}
export function resetHudFrames() {
  previous = null;
  elapsed = 0;
  frames = 0;
  if (useFrameReadout.getState().fps !== null)
    useFrameReadout.setState({ fps: null, frameMs: null });
}
