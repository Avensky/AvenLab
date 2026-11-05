import raw from './lampPositions.json';
import { VehicleFlags } from '../../store/input/protocol/inputMasks';
import { useVisualAlignmentStore } from '../../store/presentation/visualAlignmentStore';
import { vehicleAsset } from '../../worldBuilder/vehicles/vehicleCatalog';
import type { RosterEntity } from '../rosterSelector';

type Slots = {
  head: number[]; extraHead?: number[]; fog?: number[]; tail: number[];
  stop?: number[]; center: number[]; plate: number[]; frontTurn?: number[];
  rearTurn?: number[]; outlets: number[][];
};
export const positions: Record<string, Slots> = raw;
export type Tone = 'head' | 'tail' | 'stop' | 'plate' | 'amber' | 'fog';
type Kind = Tone | 'left' | 'right';
export type Lamp = { kind: Kind; at: number[]; size: [number, number, number] };

function layout(p: Slots): Lamp[] {
  const lamps: Lamp[] = [];
  for (const side of [-1, 1]) {
    function add(kind: Kind, at: number[], size: Lamp['size']) {
      lamps.push({kind, at: [at[0] * side, at[1], at[2]], size});
    }
    add('head', p.head, [.066, .048, .025]);
    if (p.extraHead) add('head', p.extraHead, [.06, .048, .025]);
    if (p.fog) add('fog', p.fog, [.05, .028, .024]);
    add('tail', p.tail, [.10, .04, .028]);
    add('stop', p.stop ?? [p.tail[0] - .14, p.tail[1], p.tail[2]], [.075, .03, .027]);
    add('plate', [.105, p.plate[1] + .06, p.plate[2]], [.04, .013, .02]);
    const turn = side < 0 ? 'left' : 'right';
    add(turn, p.frontTurn ?? [p.head[0] + .10, p.head[1], p.head[2] - .05], [.048, .033, .026]);
    add(turn, p.rearTurn ?? [p.tail[0] + .08, p.tail[1], p.tail[2] + .04], [.05, .034, .028]);
  }
  lamps.push({kind:'stop', at:p.center, size:[.12, .016, .02]});
  return lamps;
}

export const signals = Object.fromEntries(Object.entries(positions).map(([id,p]) => [id, layout(p)]));
export const lampsPerCar = Math.max(...Object.values(signals).map(lamps => lamps.length));
export const SERVICE_BRAKE_LAMP = 1 << 12;
export function lampSignal(kind: Kind, night: boolean, brake: boolean, mask=0, blink=false, high=false): Tone | null {
  if (kind === 'left' || kind === 'right') {
    const flag = kind === 'left' ? VehicleFlags.BLINKER_LEFT : VehicleFlags.BLINKER_RIGHT;
    return blink && (mask & (flag | VehicleFlags.HAZARDS)) ? 'amber' : null;
  }
  if (kind === 'stop') return brake ? 'stop' : null;
  if (kind === 'tail' && brake) return 'stop';
  if (kind === 'fog' && high) return null;
  return night ? kind : null;
}

// Full socket rigs align their authored center to the chassis. Fleet LODs are baked from the tire floor.
export function lampFloor(car: RosterEntity) {
  const report = useVisualAlignmentStore.getState().reports[car.id];
  const model = car.vehicle_id ?? '';
  if (report?.model === model && report.method === 'chassis-anchor') {
    const asset = vehicleAsset(model);
    if (asset) return report.offset[1] - asset.size[1] / 2;
  }
  return (car.collider?.nominal_wheel_center_y ?? 0) - (car.collider?.wheel_radius ?? .33);
}
