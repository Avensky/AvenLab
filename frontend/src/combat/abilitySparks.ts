import type {PhysicsEntitySnapshot} from '../store/session/networkStore';
import {visibleHealthPack} from './healthPackVisuals';

type Point = [number, number, number];
type EmitSpark = (point: Point, healing: boolean) => void;

function justActivated(before: number | undefined, after: number | undefined) {
  return before !== undefined && before <= 0 && after !== undefined && after > 0;
}

/** Comparing two confirmed observations prevents a reconnect or a newly visible
 * vehicle from replaying a cast. Preview controls have no network event. */
export function emitAbilitySparks(previous: PhysicsEntitySnapshot, current: PhysicsEntitySnapshot, emit: EmitSpark) {
  if (previous.vehicle_id !== current.vehicle_id || previous.room_id !== current.room_id) return;
  const pack = visibleHealthPack(current, current.room_id);
  if (pack && previous.support && pack.seq > previous.support.sequence) emit(pack.origin, true);
  if (pack?.state === 'hit' && pack.healed_hp > 0 && previous.support &&
      (pack.seq > previous.support.sequence || (previous.support.pack?.seq === pack.seq && previous.support.pack.state === 'flying'))) {
    emit(pack.position, true);
  }

  const guard = current.guard, oldGuard = previous.guard;
  const defensive = justActivated(oldGuard?.cooldown_s, guard?.cooldown_s) ||
    justActivated(oldGuard?.dive_remaining_s, guard?.dive_remaining_s) ||
    justActivated(previous.combat?.ram_remaining, current.combat?.ram_remaining);
  const recovery = justActivated(previous.health?.revive_cooldown_s, current.health?.revive_cooldown_s);
  if (defensive || recovery) {
    const [x,y,z] = current.position;
    emit([x, y + (current.combat?.y ?? 1.3), z], recovery);
  }
}
