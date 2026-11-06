import {useEffect} from 'react';
import {isDrivingScreen, useUIStore} from '../store/menus/uiStore';
import {useMotionView, type MotionState} from '../store/session/networkViews';
import {useInputStore} from '../store/input/inputStore';
import {VehicleFlags} from '../store/input/protocol/inputMasks';
import {ResourceFlags} from '../store/telemetry/resourceMasks';
import {usePreferencesStore} from '../store/preferences/preferencesStore';
import {announceGame,clearCombatNotices,useCombatNotices} from './combatNoticeStore';
import {onNavalDeck} from './navalDeckHold';
import './combatNotices.css';

const warnings: [number, string][] = [
  [ResourceFlags.LOW_FUEL, 'Low fuel'], [ResourceFlags.STARVED, 'Fuel empty'],
  [ResourceFlags.HOT, 'Engine hot'], [ResourceFlags.THERMAL_RECOVERY, 'Engine cooling'],
  [ResourceFlags.DAMAGED, 'Engine damaged'], [ResourceFlags.BLINK_STRESS, 'Blink strain'],
];

function watchCombatFeedback() {
  let identity = '', flags = 0, stun = false, boost = false, empty = false, deckHold=false, blocked = '',defeated=false;
  let total: number | undefined;
  let damage = 0, timer: ReturnType<typeof setTimeout> | undefined;
  function reset() {
    clearTimeout(timer);
    timer = undefined;
    damage = 0;
    clearCombatNotices();
  }
  function read(state: MotionState) {
    const me = state.connected && state.getMe();
    const key = me ? [state.playerId, me.room_id, me.vehicle_id, state.snapshot?.match_state?.phase].join('/') : '';
    const same = key !== '' && key === identity;
    if (key !== identity) reset();
    identity = key;
    if (!me) return;
    const mask = me.resource_mask ?? 0;
    const stunned = (me.combat?.stun_remaining ?? 0) > 0;
    const reason = me.combat?.ram_blocked ?? '';
    const roadNos = me.vehicle_id !== 'tank' && !me.guard?.remaining_s && !me.combat?.ram_remaining;
    const boosting = roadNos && Boolean(me.vehicle_mask & VehicleFlags.BOOST);
    const dry = roadNos && me.boost_fraction === 0 && Boolean(useInputStore.getState().input.vehicleMask & VehicleFlags.BOOST);
    const onDeck=onNavalDeck(me,state.snapshot);
    const next = me.health?.stats?.damage_dealt;
    if (same) {
      for (const [bit, text] of warnings) if ((mask & ~flags) & bit) announceGame(text,'warning');
      if (stunned && !stun) announceGame('STUNNED · CONTROLS INTERRUPTED','debuff');
      if (reason && reason !== blocked) announceGame(reason,'warning');
      if (boosting && !boost) announceGame('NITROUS · SPEED + STABILITY', 'buff');
      if (dry && !empty) announceGame('NITROUS EMPTY · BOOST UNAVAILABLE','debuff');
      if (onDeck && !deckHold) announceGame('RESCUE DECK · AUTO BRAKE ENGAGED','buff','rescue');
      const down=me.health?.defeated===true;
      if(down&&!defeated)announceGame(me.health?.last_damage_kind==='water'?'VEHICLE LOST IN WATER':
        me.health?.last_damage_kind==='out_of_bounds'?'OUT OF BOUNDS':'VEHICLE DISABLED','debuff','system');
      if(!down&&defeated)announceGame('RESPAWN COMPLETE · SPAWN SHIELD ACTIVE','buff','system');
      if (next !== undefined && total !== undefined && next > total) {
        damage += next - total;
        if (timer === undefined) timer = setTimeout(() => {
          announceGame(Math.round(damage) + ' DAMAGE', 'damage');
          damage = 0;
          timer = undefined;
        }, 300);
      }
    }
    flags = mask; stun = stunned; boost = boosting; empty = dry; deckHold=onDeck; blocked = reason;
    defeated=me.health?.defeated===true;total=next;
  }
  read(useMotionView.getState());
  const stop = useMotionView.subscribe(read);
  return () => { stop(); reset(); };
}

export function CombatNotices() {
  const visible = useUIStore(s => isDrivingScreen(s.screen) && !s.overlay && !s.isModeLoading);
  const lines = useCombatNotices(s => s.lines);
  const channels=usePreferencesStore(s=>s.notificationChannels);
  useEffect(() => {
    if (visible) return watchCombatFeedback();
    clearCombatNotices();
  }, [visible]);
  useEffect(() => {
    if (!lines.length) return;
    const timer = setTimeout(() => {
      const now = performance.now();
      useCombatNotices.setState(s => ({lines: s.lines.filter(n => n.expires > now)}));
    }, Math.max(1, Math.ceil(lines[0].expires - performance.now())));
    return () => clearTimeout(timer);
  }, [lines]);
  if (!visible) return null;
  return <aside className="combat-notices" aria-live="polite" aria-atomic="false">
    {lines.filter(line=>channels[line.channel]).map(line => <span data-tone={line.tone} data-channel={line.channel} key={line.id}>{line.text}</span>)}
  </aside>;
}
