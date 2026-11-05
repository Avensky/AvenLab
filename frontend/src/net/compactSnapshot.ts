/** Version-one self-contained snapshot tuples. Field order matches snapshot_wire.rs.
 * Normalize once at the network boundary; all gameplay/HUD stores keep one shape.
 * Full tuples need no previous state; snapshotDecoder restores deltas first.
 */
const fields = {
  entity: 'id kind vehicle_id room_id team position rotation speed rpm gear fuel temp engine_torque condition ultimate_fraction boost_fraction resource_mask cockpit_mask parking_brake cabin_mask cruise_target_kph cluster_mask vehicle_mask player_mask last_input_seq collider wheels combat health guard support barrage appearance flags wheel_mask'.split(' '),
  collider: 'nominal_wheel_center_y chassis_half_extents chassis_offset wheel_radius wheel_count'.split(' '),
  wheel: 'id position rotation radius wheel_speed steer_angle'.split(' '),
  health: 'hp max_hp respawn_remaining_s disabled_reason recovery_window_s revive_cooldown_s spawn_protection_s damage_seq last_attacker last_damage last_damage_kind kills deaths stats'.split(' '),
  stats: 'damage_dealt healing_done self_healing gas_burned_liters gas_gained_liters assists resurrections respawns current_kill_streak best_kill_streak'.split(' '),
  combat: 'assisted_target shot_origin impact_normal shot_weapon impact impact_time lock_yaw lock_pitch ram_blocked ram_remaining ram_charge_remaining stun_remaining ram_cooldown cannon_reload coax_reload basket_reload weapon cannon_shot shot ammo reload yaw pitch x y z role'.split(' '),
  guard: 'kind remaining_s cooldown_s shield_hp shield_max_hp break_seq panel panel_yaw dive_remaining_s dive_cooldown_s'.split(' '),
} as const;
type Row = Record<string, any>;
function unpack(keys: readonly string[], value: unknown): Row {
  if (!Array.isArray(value) || value.length !== keys.length) throw new Error('Invalid compact tuple');
  const result: Row = {};
  for (let i = 0; i < keys.length; i++) result[keys[i]] = value[i];
  return result;
}
export function decodeCompactSnapshot(message: unknown): Row | null {
  try {
    const wire = message as Row;
    if (wire?.type !== 'snapshot_compact' || wire.version !== 1 || !Number.isSafeInteger(wire.world_id)) return null;
    const data = unpack(['tick','simulation_time_s','tick_dt_s','entities','match_state','asset_health','server_timing'], wire.data);
    if (!Array.isArray(data.entities) || data.entities.length > 96) return null;
    data.entities = data.entities.map((value: unknown) => {
      const entity = unpack(fields.entity, value);
      if (!Number.isInteger(entity.flags) || entity.flags<0 || entity.flags>63 ||
          !Number.isInteger(entity.wheel_mask) || entity.wheel_mask<0 || entity.wheel_mask>0xffffffff) throw new Error('Invalid bitmask');
      const flags=entity.flags, wheelMask=entity.wheel_mask;
      delete entity.flags; delete entity.wheel_mask;
      entity.collider = unpack(fields.collider, entity.collider);
      entity.health = unpack(fields.health, entity.health);
      entity.health.defeated=Boolean(flags&1);
      entity.health.stats = unpack(fields.stats, entity.health.stats);
      entity.combat = unpack(fields.combat, entity.combat);
      Object.assign(entity.combat,{enabled:Boolean(flags&2),fire:Boolean(flags&4),hull_locked:Boolean(flags&8),ram:Boolean(flags&16),impact_static:Boolean(flags&32)});
      if (entity.combat.assisted_target === null) delete entity.combat.assisted_target;
      entity.guard = unpack(fields.guard, entity.guard);
      if (entity.guard.panel === null) delete entity.guard.panel;
      if (entity.barrage === null) delete entity.barrage;
      if (entity.wheels !== null) {
        if (!Array.isArray(entity.wheels) || entity.wheels.length > 32) throw new Error('Invalid wheels');
        entity.wheels = entity.wheels.map((wheel: unknown,index:number) => ({...unpack(fields.wheel, wheel),grounded:Boolean((wheelMask>>>index)&1)}));
      }
      return entity;
    });
    return {type:'snapshot',world_id:wire.world_id,data};
  } catch { return null; }
}
