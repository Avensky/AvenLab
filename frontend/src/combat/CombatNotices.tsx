import {memo,useEffect,type CSSProperties} from 'react';
import {isDrivingScreen,useUIStore} from '../store/menus/uiStore';
import {useMotionView,type MotionState} from '../store/session/networkViews';
import {useInputStore} from '../store/input/inputStore';
import {VehicleFlags} from '../store/input/protocol/inputMasks';
import {HUD_STALE_MS} from '../store/telemetry/vehicleTelemetryStore';
import {usePreferencesStore} from '../store/preferences/preferencesStore';
import {channelForTone} from './noticeModel';
import {NOTICE_LIFETIME_MS} from './noticeQueue';
import {announceGame,bindNoticeAudience,captureNoticeEvent,clearCombatNotices,discardMutedNotices,
  useCombatNotices,type GameNotice,type NoticeAudience,type NoticeEvent} from './combatNoticeStore';
import {vehicleNoticeSignals,vehicleNoticeTransitions} from './vehicleNoticeSignals';
import {startVehicleFeedbackFreshness,useVehicleFeedbackFreshness} from './vehicleFeedbackFreshness';
import {onNavalDeck} from './navalDeckHold';
import './combatNotices.css';

/** Snapshot transitions produce events, not React state per socket frame.
 * There is one damage coalescer and the store owns the one expiry timer. */
function watchCombatFeedback(){
  let identity='',lastActor='',epoch=0,lastSnapshot:MotionState['snapshot'];
  let previous:ReturnType<typeof vehicleNoticeSignals>|undefined;
  let damage=0,timer:ReturnType<typeof setTimeout>|undefined,damageEvent:NoticeEvent|undefined;
  function audience():NoticeAudience{
    const state=useMotionView.getState(),ui=useUIStore.getState();
    const me=state.connected?state.getMe():undefined;
    const received=state.snapshot?.received_at_ms,now=performance.now();
    const bound=!!me&&me.id===state.playerId&&(state.room_id===null||me.room_id===state.room_id);
    return {
      active:isDrivingScreen(ui.screen)&&ui.overlay===null&&!ui.isModeLoading&&document.visibilityState!=='hidden',
      session:[epoch,ui.screen,state.playerId||'disconnected',state.room_id??'none',me?.vehicle_id??'pending',
        state.snapshot?.match_state?.match_id??'',state.snapshot?.match_state?.phase??''].join('/'),
      fresh:bound&&typeof received==='number'&&Number.isFinite(received)&&now>=received&&now-received<=HUD_STALE_MS,
      channels:usePreferencesStore.getState().notificationChannels,
    };
  }
  function reset(invalidate=false){
    if(invalidate)epoch++;
    clearTimeout(timer);timer=undefined;damage=0;damageEvent=undefined;
    previous=undefined;identity='';lastSnapshot=null;clearCombatNotices();
  }
  function read(state=useMotionView.getState()){
    const view=audience(),me=state.connected?state.getMe():undefined;
    const actor=me?[state.playerId,me.room_id,me.vehicle_id,state.snapshot?.match_state?.match_id??'',state.snapshot?.match_state?.phase??''].join('/') : '';
    const newActor=!!actor&&actor!==lastActor;
    // Observe identity even while hidden/loading, but never replay effects from
    // that interval when the same actor resumes. A new live spawn may flash once.
    if(actor)lastActor=actor;
    if(!view.active){
      if(previous||identity||useCombatNotices.getState().lines.length)reset(true);
      return;
    }
    if(!view.fresh||!me){
      if(previous||identity)reset(true);
      return;
    }
    if(identity===view.session&&lastSnapshot===state.snapshot)return;
    if(identity!==view.session){reset();identity=view.session;}
    lastSnapshot=state.snapshot;
    const current=vehicleNoticeSignals(me,Boolean(useInputStore.getState().input.vehicleMask&VehicleFlags.BOOST),onNavalDeck(me,state.snapshot));
    for(const notice of vehicleNoticeTransitions(previous,current,newActor)){
      announceGame(notice.text,notice.tone,notice.channel??channelForTone(notice.tone));
    }
    if(previous&&typeof current.damage==='number'&&typeof previous.damage==='number'&&Number.isFinite(current.damage)&&Number.isFinite(previous.damage)&&current.damage>previous.damage){
      damage+=current.damage-previous.damage;
      if(timer===undefined){
        damageEvent=captureNoticeEvent();
        timer=setTimeout(()=>{
          // Audience and event age are checked again after any main-thread stall.
          if(damageEvent)announceGame(`${Math.round(damage)} DAMAGE`,'damage','combat',damageEvent);
          damage=0;damageEvent=undefined;timer=undefined;
        },250);
      }
    }
    previous=current;
  }
  const unbind=bindNoticeAudience(audience);
  const stopFreshness=startVehicleFeedbackFreshness();
  let signal=useVehicleFeedbackFreshness.getState().signal;
  const stopSignal=useVehicleFeedbackFreshness.subscribe(state=>{
    if(state.signal===signal)return;
    const wasLive=signal==='live';signal=state.signal;
    if(signal==='live'){read();return;}
    reset(true);
    // Link warnings are the only notices allowed without fresh vehicle data.
    // They flash once on a transition, never remain as a bottom status banner.
    if(wasLive&&signal!=='hidden'){
      const event=captureNoticeEvent(true);
      if(event)announceGame(signal==='offline'?'CONNECTION LOST':'VEHICLE SIGNAL DELAYED','warning','system',event);
    }
  });
  const stopMotion=useMotionView.subscribe(read);
  const stopUI=useUIStore.subscribe(()=>read());
  const stopPreferences=usePreferencesStore.subscribe((state,previous)=>{
    if(state.notificationChannels!==previous.notificationChannels)discardMutedNotices(state.notificationChannels);
  });
  function visibility(){reset(true);if(document.visibilityState!=='hidden')read();}
  document.addEventListener('visibilitychange',visibility);
  read();
  return()=>{
    stopMotion();stopUI();stopPreferences();stopSignal();stopFreshness();
    document.removeEventListener('visibilitychange',visibility);reset(true);unbind();
  };
}

const NoticeLine=memo(function NoticeLine({line}:{line:GameNotice}){
  // A delayed React commit starts at the remaining lifetime, not a full replay.
  // Memoization keeps existing animations from jumping when another line enters.
  const delay=-Math.max(0,performance.now()-line.created);
  return <span className="combat-notice-line" data-tone={line.tone} data-channel={line.channel}
    style={{'--notice-slot':line.slot,animationDelay:`${delay}ms`,animationDuration:`${NOTICE_LIFETIME_MS}ms`} as CSSProperties}>{line.text}</span>;
});

export function CombatNotices(){
  const visible=useUIStore(s=>isDrivingScreen(s.screen)&&s.overlay===null&&!s.isModeLoading);
  const lines=useCombatNotices(s=>s.lines);
  const channels=usePreferencesStore(s=>s.notificationChannels);
  useEffect(watchCombatFeedback,[]);
  if(!visible)return null;
  const now=performance.now();
  return <aside className="combat-notices" aria-live="polite" aria-atomic="false">
    {lines.filter(line=>line.expires>now&&channels[line.channel]).map(line=><NoticeLine line={line} key={line.id}/>)}
  </aside>;
}
