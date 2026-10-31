import { create } from "zustand";
import { useInputStore } from "../input/inputStore";
import { PlayerFlags } from "../input/protocol/inputMasks";
type RadioState = {
  powered: boolean;
  track: string;
  title: string;
  artist: string;
  station: string;
  playing: boolean;
  volume: number;
  muted: boolean;
  message: string;
  trackCount: number;
  trackIndex: number;
};
const POWER_KEY = "avenlab.radio.powered.v1";
function savedPower() {
  try {
    return localStorage.getItem(POWER_KEY) !== "false";
  } catch {
    return true;
  }
}
export const useRadioStore = create<RadioState>(() => ({
  powered: savedPower(),
  track: "NO SOURCE",
  title: "",
  artist: "",
  station: "LOCAL AUDIO",
  playing: false,
  volume: 0.6,
  muted: false,
  message: "",
  trackCount: 0,
  trackIndex: 0,
}));
let audio: HTMLAudioElement | null = null,
  source: string | null = null,
  queue: File[] = [],
  playAttempt = 0;
function playing(value: boolean) {
  // A late media event must never re-enable the RADIO flag after power-off.
  value = value && useRadioStore.getState().powered;
  useRadioStore.setState({ playing: value });
  useInputStore.getState().setPlayerFlag(PlayerFlags.RADIO, value);
}
function player() {
  if (!audio) {
    audio = new Audio();
    audio.onplay = () => {
      if (!useRadioStore.getState().powered) {
        stopRadio();
        return;
      }
      playing(true);
      useRadioStore.setState({ message: "" });
    };
    audio.onpause = () => {
      if (audio?.paused) playing(false);
    };
    audio.onended = () => {
      if (!audio?.ended || !useRadioStore.getState().powered) return;
      playing(false);
      const i = useRadioStore.getState().trackIndex;
      if (i + 1 < queue.length) void selectTrack(i + 1);
    };
    audio.onerror = () => {
      if (!useRadioStore.getState().powered) return;
      playing(false);
      useRadioStore.setState({ message: "AUDIO SOURCE UNAVAILABLE" });
    };
  }
  return audio;
}
/** Power and pause share one cancellation path. Keep the source, queue,
 * currentTime, volume and mute intact so explicit power-on can resume. */
function stopRadio() {
  ++playAttempt;
  audio?.pause();
  playing(false);
}
async function startRadio() {
  if (!source || !useRadioStore.getState().powered) return;
  const element = player(),
    attempt = ++playAttempt;
  try {
    await element.play();
    if (!useRadioStore.getState().powered) {
      stopRadio();
      return;
    }
    if (attempt === playAttempt) playing(!element.paused);
  } catch {
    // Source replacement and power-off invalidate earlier play promises.
    if (attempt === playAttempt && useRadioStore.getState().powered) {
      playing(false);
      useRadioStore.setState({ message: "PRESS PLAY TO START AUDIO" });
    }
  }
}
export async function setRadioPower(powered: boolean) {
  useRadioStore.setState({ powered, message: "" });
  try {
    localStorage.setItem(POWER_KEY, String(powered));
  } catch {
    // Private/blocked storage must not prevent the physical power switch.
  }
  if (!powered) stopRadio();
  else await startRadio();
}
export function setRadioVolume(value: number) {
  if (!Number.isFinite(value)) return;
  const volume = Math.max(0, Math.min(1, value));
  useRadioStore.setState({ volume });
  if (audio) audio.volume = useRadioStore.getState().muted ? 0 : volume;
}
export function toggleRadioMute() {
  const s = useRadioStore.getState();
  useRadioStore.setState({ muted: !s.muted });
  if (audio) audio.volume = !s.muted ? 0 : s.volume;
}
export async function toggleRadio() {
  if (!useRadioStore.getState().powered) return;
  if (!source) {
    useRadioStore.setState({ message: "CHOOSE LOCAL AUDIO FILES" });
    return;
  }
  if (player().paused) await startRadio();
  else stopRadio();
}
async function selectTrack(index: number) {
  if (!queue.length) return;
  const element = player(),
    i = (index + queue.length) % queue.length,
    file = queue[i];
  stopRadio();
  if (source) URL.revokeObjectURL(source);
  source = URL.createObjectURL(file);
  element.src = source;
  const state = useRadioStore.getState();
  element.volume = state.muted ? 0 : state.volume;
  const parts = file.name.replace(/\.[^.]+$/, "").split(/\s+-\s+/, 2);
  useRadioStore.setState({
    title: parts.length === 2 ? parts[1] : parts[0],
    artist: parts.length === 2 ? parts[0] : "",
    track: file.name,
    playing: false,
    message: "",
    trackCount: queue.length,
    trackIndex: i,
  });
  // Loading a playlist while off prepares it without silently restoring power.
  await startRadio();
}
export async function loadRadioFiles(files: File[]) {
  if (!files.length) return;
  queue = files.slice(0, 100);
  await selectTrack(0);
}
export async function loadRadioFile(file: File) {
  await loadRadioFiles([file]);
}
export async function nextRadioTrack() {
  if (useRadioStore.getState().powered && queue.length > 1)
    await selectTrack(useRadioStore.getState().trackIndex + 1);
}
export function restartRadio() {
  if (audio && source && useRadioStore.getState().powered) {
    try {
      audio.currentTime = 0;
    } catch {
      useRadioStore.setState({ message: "TRACK CANNOT SEEK" });
    }
  }
}
export async function previousRadioTrack() {
  if (!useRadioStore.getState().powered) return;
  if ((audio?.currentTime ?? 0) > 3 || queue.length < 2) restartRadio();
  else await selectTrack(useRadioStore.getState().trackIndex - 1);
}
