import {ENGINE_PROFILES,type EngineFamily} from './audioProfiles.ts';

export type ProceduralSample = EngineFamily | 'friction' | 'track' | 'air';
export const SAMPLE_RATE = 24000;

/** Original, deterministic synthesis. No samples, downloads, licensing keys,
 * ScriptProcessor or per-frame PCM generation. Each loop is generated once. */
export function synthesizeVehicleLoop(kind: ProceduralSample, sampleRate = SAMPLE_RATE): Float32Array<ArrayBuffer> {
  const length = Math.max(8000, Math.min(96000, Math.round(sampleRate)));
  const samples = new Float32Array(length);
  let seed = 937, smoothNoise = 0;
  const noise = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 2147483648 - 1;
  };
  const engine = kind in ENGINE_PROFILES ? ENGINE_PROFILES[kind as EngineFamily] : null;
  for (let i = 0; i < length; i++) {
    const t = i / length, random = noise();
    smoothNoise += (random - smoothNoise) * .12;
    let value: number;
    if (engine) {
      // Integer firing cycles over one second make rate-changing loops seamless.
      const firing = engine.cylinders * engine.baseRpm / 120;
      const phase = 2 * Math.PI * firing * t;
      const pulse = Math.pow(.5 + .5 * Math.cos(phase), 5);
      const crank = 2 * Math.PI * engine.baseRpm / 60 * t;
      const irregular = engine.family === 'boxer' ? .72 + .28 * Math.sin(crank) :
        engine.family === 'v8' ? .82 + .18 * Math.cos(crank * 2) : 1;
      const low = engine.marine ? .72 : engine.tracks ? .55 : .3;
      value = (pulse - .2461) * irregular * .72 + Math.sin(crank) * low * .25 +
        Math.sin(phase * 2.0) * .13 + Math.sin(phase * 3.0) * .045;
    } else if (kind === 'track') {
      const phase = 2 * Math.PI * 26 * t;
      const clink = Math.pow(.5 + .5 * Math.cos(phase), 24);
      value = .36 * smoothNoise + clink * (.26 * Math.sin(phase * 23) + .15 * Math.sin(phase * 37));
    } else if (kind === 'air') {
      value = .6 * (random - smoothNoise);
    } else {
      value = .55 * random + .25 * smoothNoise;
    }
    // Noise loops receive a tiny wrap fade to avoid a periodic click.
    const fade = engine ? 1 : Math.min(1, i / 100, (length - 1 - i) / 100);
    samples[i] = Math.max(-.9, Math.min(.9, value)) * fade;
  }
  // Remove DC, without normalizing quiet detail into an unexpectedly loud sound.
  let mean = 0;
  for (const value of samples) mean += value;
  mean /= samples.length;
  for (let i = 0; i < samples.length; i++) samples[i] -= mean;
  return samples;
}
