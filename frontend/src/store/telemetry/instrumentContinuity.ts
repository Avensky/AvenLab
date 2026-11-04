import { ResourceFlags } from './resourceMasks';
import type { VehicleTelemetry } from './vehicleTelemetryStore';

export type InstrumentPower = 'off' | 'on' | 'running';
export const INSTRUMENT_POWER_GRACE_MS = 2000;

/** Packet jitter is not an engine shutdown. Keep only the last confirmed
 * illumination for a bounded interval; all numeric values still become stale.
 * STARTING becomes steady ON during a delay instead of replaying a crank pulse. */
export function createInstrumentContinuity() {
  let previousSession = '', power: InstrumentPower | undefined;
  return (session: string, data: VehicleTelemetry, received: number | undefined, now: number): InstrumentPower | undefined => {
    if (!session || session !== previousSession) {power = undefined; previousSession = session;}
    if (data.signal === 'live') {
      power = data.engineOn ? 'running' : (data.resourceMask & ResourceFlags.STARTING) ||
        data.cabinMask !== null && Boolean(data.cabinMask & (1 << 14)) && ((data.cabinMask >>> 10) & 3) === 2 ? 'on' : 'off';
      return undefined;
    }
    if (data.signal === 'stale' && received !== undefined && Number.isFinite(received) && now >= received && now - received <= INSTRUMENT_POWER_GRACE_MS) return power;
    power = undefined;
    return undefined;
  };
}
