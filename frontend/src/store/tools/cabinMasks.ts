export type CabinState = { temperatureC: number; fan: number; airflow: number; ac: boolean; recirculate: boolean; frontDefrost: boolean; rearDefrost: boolean; ignition: number; keyInserted: boolean };
export const DEFAULT_CABIN_MASK = 4; // 20 C, fan off
export function unpackCabin(mask = DEFAULT_CABIN_MASK): CabinState {
  return { temperatureC: 16 + Math.min(14,mask & 15), fan: mask & (1<<19) ? 4 : (mask >>> 4) & 3, airflow: Math.min(4,(mask>>>16)&7),
    ac: Boolean(mask & 64), recirculate: Boolean(mask & 128), frontDefrost: Boolean(mask & 256), rearDefrost: Boolean(mask & 512), ignition:(mask>>>10)&3, keyInserted:Boolean(mask&4096) };
}
export function reviseCabin(mask: number | undefined, patch: Partial<CabinState>, ignitionCommand = false) {
  const old = unpackCabin(mask), next = {...old,...patch};
  const temperature = Number.isFinite(next.temperatureC) ? Math.max(16,Math.min(30,Math.round(next.temperatureC))) : old.temperatureC;
  const fan = Number.isFinite(next.fan) ? Math.max(0,Math.min(4,Math.round(next.fan))) : old.fan;
  return (temperature-16) | (Math.min(3,fan)<<4) | (Number(Boolean(next.ac))<<6) | (Number(Boolean(next.recirculate))<<7)
    | (Number(Boolean(next.frontDefrost))<<8) | (Number(Boolean(next.rearDefrost))<<9)
    | ((Number.isInteger(next.ignition)?Math.max(0,Math.min(3,next.ignition)):old.ignition)<<10)
    | (Number(Boolean(next.keyInserted))<<12) | (Number(ignitionCommand)<<13) | ((Number.isInteger(next.airflow)?Math.max(0,Math.min(4,next.airflow)):old.airflow)<<16) | (Number(fan===4)<<19);
}
