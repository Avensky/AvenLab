/** Device-local sound preferences. These never change server vehicle physics. */
export interface VehicleAudioSettings {
  enabled: boolean;
  master: number;
  engines: number;
  tires: number;
  tracks: number;
  turbo: number;
  nitrous: number;
  echo: number;
  spatial: boolean;
  maxVoices: 2 | 4 | 6;
}

export const DEFAULT_VEHICLE_AUDIO: Readonly<VehicleAudioSettings> = Object.freeze({
  enabled: true, master: .55, engines: .8, tires: .35, tracks: .45,
  turbo: .5, nitrous: .45, echo: .25, spatial: true, maxVoices: 4,
});

export function sanitizeVehicleAudio(value: unknown): VehicleAudioSettings {
  const data = value && typeof value === 'object' ? value as Partial<VehicleAudioSettings> : {};
  const volume = (key: 'master' | 'engines' | 'tires' | 'tracks' | 'turbo' | 'nitrous' | 'echo') =>
    typeof data[key] === 'number' && Number.isFinite(data[key])
      ? Math.max(0, Math.min(1, data[key]!)) : DEFAULT_VEHICLE_AUDIO[key];
  return {
    enabled: data.enabled !== false, spatial: data.spatial !== false,
    master: volume('master'), engines: volume('engines'), tires: volume('tires'),
    tracks: volume('tracks'), turbo: volume('turbo'), nitrous: volume('nitrous'), echo: volume('echo'),
    maxVoices: data.maxVoices === 2 || data.maxVoices === 6 ? data.maxVoices : 4,
  };
}
