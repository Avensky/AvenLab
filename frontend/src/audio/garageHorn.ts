import { peekVehicleAudio } from "./sharedAudio";
import { useVehicleAudioSettings } from "./vehicleAudioSettings";

/** A short dual-tone preview on the existing shared vehicle audio bus. */
export function createGarageHorn() {
  let pressed = false;
  let voices: { oscillator: OscillatorNode; gain: GainNode }[] = [];
  function release() {
    for (const { oscillator, gain } of voices) {
      const now = gain.context.currentTime;
      gain.gain.cancelScheduledValues(0);
      gain.gain.setTargetAtTime(0, now, .018);
      oscillator.stop(now + .09);
    }
    voices = [];
  }
  return {
    setPressed(next: boolean) {
      if (next === pressed) return;
      pressed = next;
      release();
      const shared = peekVehicleAudio();
      if (!next || !shared || shared.context.state !== "running" || !useVehicleAudioSettings.getState().enabled) return;
      const { context, output } = shared;
      const now = context.currentTime;
      voices = [349, 440].map(frequency => {
        const oscillator = context.createOscillator(), gain = context.createGain();
        oscillator.type = "triangle";
        oscillator.frequency.value = frequency;
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(.075, now + .025);
        oscillator.connect(gain).connect(output);
        oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
        oscillator.start(now);
        return { oscillator, gain };
      });
    },
    stop() { pressed = false; release(); },
  };
}
