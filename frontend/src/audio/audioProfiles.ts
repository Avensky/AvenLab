export type EngineFamily = 'four' | 'boxer' | 'six' | 'v8' | 'diesel' | 'marine';
export type AudioProfile = Readonly<{
  family: EngineFamily; cylinders: number; baseRpm: number; turbo: boolean;
  tracks: boolean; marine: boolean; referenceDistance: number;
}>;

const four: AudioProfile = Object.freeze({family:'four',cylinders:4,baseRpm:1800,turbo:false,tracks:false,marine:false,referenceDistance:5});
const boxer: AudioProfile = Object.freeze({...four,family:'boxer'});
const six: AudioProfile = Object.freeze({...four,family:'six',cylinders:6,turbo:true});
const v8: AudioProfile = Object.freeze({...four,family:'v8',cylinders:8});
const diesel: AudioProfile = Object.freeze({...four,family:'diesel',cylinders:12,baseRpm:900,tracks:true,referenceDistance:10});
const marine: AudioProfile = Object.freeze({...diesel,family:'marine',cylinders:16,baseRpm:600,tracks:false,marine:true,referenceDistance:22});
const turboFour: AudioProfile = Object.freeze({...four,turbo:true});
const profiles: Record<string,AudioProfile> = {
  ae86:four, brz:boxer, 'fr-s':boxer, gt86:boxer, camaro:v8, charger70:v8,
  sierra:v8, supra:six, 'supra-1998':six, skyline34:six, mini:turboFour, cx30:turboFour,
  fortuner:four,landcruiser:v8,
  enforcer:six, interceptor:v8, timecar:six, tank:diesel,
  'hawaii-rescue':marine, louisiana:marine, 'arleigh-burke':marine,burke:marine,arizona:marine,'big-e':marine,
};

/** These are sonic families, not claims of sample recordings from real cars. */
export const vehicleAudioProfile = (id: string | null | undefined): AudioProfile => profiles[id ?? ''] ?? four;
// Aircraft are intentionally excluded until a rotor/jet sound family exists;
// an unrecognized asset must not accidentally sound like a four-cylinder car.
export const hasVehicleAudioProfile = (id: string | null | undefined): boolean => !!id && Object.hasOwn(profiles,id);
export const ENGINE_PROFILES: Readonly<Record<EngineFamily,AudioProfile>> = Object.freeze({four,boxer,six,v8,diesel,marine});
