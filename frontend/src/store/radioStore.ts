import { create } from "zustand";
import { PlayerFlags } from "./tools/inputMasks";
import { useInputStore } from "./inputStore";

type RadioState = { track: string; title:string; artist:string; station:string; playing: boolean; volume: number; muted: boolean; message: string };
export const useRadioStore = create<RadioState>(() => ({ track: "NO SOURCE", title:"",artist:"",station:"LOCAL AUDIO", playing: false, volume: .6, muted: false, message: "" }));
let audio: HTMLAudioElement | null = null, source: string | null = null;
function player() {
  if (!audio) {
    audio = new Audio();
    audio.onplay = () => { useRadioStore.setState({ playing: true, message: "" }); useInputStore.getState().setPlayerFlag(PlayerFlags.RADIO, true); };
    audio.onpause = audio.onended = () => { if (audio?.paused || audio?.ended) { useRadioStore.setState({ playing: false }); useInputStore.getState().setPlayerFlag(PlayerFlags.RADIO, false); } };
    audio.onerror = () => useRadioStore.setState({ playing: false, message: "AUDIO SOURCE UNAVAILABLE" });
  }
  return audio;
}
export function setRadioVolume(value: number) {
  const volume = Math.max(0, Math.min(1, value)); useRadioStore.setState({ volume });
  if (audio) audio.volume = useRadioStore.getState().muted ? 0 : volume;
}
export function toggleRadioMute() {
  const state = useRadioStore.getState(); useRadioStore.setState({ muted: !state.muted });
  if (audio) audio.volume = !state.muted ? 0 : state.volume;
}
export async function toggleRadio() {
  if (!source) { useRadioStore.setState({ message: "CHOOSE A LOCAL AUDIO FILE" }); return; }
  const element = player();
  if (element.paused) {
    try { await element.play(); useInputStore.getState().setPlayerFlag(PlayerFlags.RADIO, true); }
    catch { useRadioStore.setState({ message: "PRESS PLAY TO START AUDIO" }); }
  } else { element.pause(); useInputStore.getState().setPlayerFlag(PlayerFlags.RADIO, false); }
}
export async function loadRadioFile(file: File) {
  const element = player(); element.pause();
  if (source) URL.revokeObjectURL(source);
  source = URL.createObjectURL(file); element.src = source;
  const state = useRadioStore.getState(); element.volume = state.muted ? 0 : state.volume;
  const parts=file.name.replace(/\.[^.]+$/, "").split(/\s+-\s+/,2);
  useRadioStore.setState({ title:parts.length===2?parts[1]:parts[0],artist:parts.length===2?parts[0]:"",track: file.name, playing: false, message: "" });
  await toggleRadio();
}
