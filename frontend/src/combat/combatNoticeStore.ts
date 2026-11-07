import {create} from 'zustand';
import {channelForTone,type NoticeChannel,type NoticeTone} from './noticeModel';
import {enqueueNotice,pruneNotices,type GameNotice} from './noticeQueue';

export type {NoticeTone,NoticeChannel} from './noticeModel';
export type {GameNotice} from './noticeQueue';
export type NoticeAudience={active:boolean;session:string;fresh:boolean;channels:Record<NoticeChannel,boolean>};
/** Capture this before an async request. A late reply must not announce into
 * a different vehicle, room, match, or a later return to the driving screen. */
export type NoticeEvent={session:string;owner:number;at:number;allowStale?:boolean};
export const useCombatNotices = create<{ lines: GameNotice[] }>(() => ({ lines: [] }));
let sequence = 0;
let reader:(()=>NoticeAudience)|undefined;
let expiry:ReturnType<typeof setTimeout>|undefined;
let deadline=0;
let owner=0;

function scheduleExpiry(){
  const lines=useCombatNotices.getState().lines;
  const next=lines.length?Math.min(...lines.map(line=>line.expires)):0;
  if(next===deadline&&expiry!==undefined)return;
  clearTimeout(expiry);expiry=undefined;deadline=next;
  if(!next)return;
  expiry=setTimeout(()=>{
    expiry=undefined;deadline=0;
    const current=useCombatNotices.getState().lines;
    const live=pruneNotices(current,performance.now());
    if(live!==current)useCombatNotices.setState({lines:live});
    scheduleExpiry();
  },Math.max(1,Math.ceil(next-performance.now())));
}

/** One HUD owner supplies a synchronous gate. Producers cannot queue notices
 * while paused/hidden, even in the interval before a React effect cleans up. */
export function bindNoticeAudience(read:()=>NoticeAudience){
  clearCombatNotices();owner++;reader=read;
  return()=>{if(reader===read){reader=undefined;clearCombatNotices();}};
}

export function captureNoticeEvent(allowStale=false):NoticeEvent|undefined{
  const audience=reader?.();
  return audience?.active&&audience.session&&(allowStale||audience.fresh)
    ?{session:audience.session,owner,at:performance.now(),allowStale}:undefined;
}

export function announceGame(text:string,tone:NoticeTone='system',channel:NoticeChannel=channelForTone(tone),event?:NoticeEvent){
  const audience=reader?.(),now=performance.now();
  if(!audience?.active||!audience.session||!audience.channels[channel]||(!audience.fresh&&!event?.allowStale))return;
  if(event&&(event.owner!==owner||event.session!==audience.session))return;
  const current=useCombatNotices.getState().lines;
  const lines=enqueueNotice(current,{id:sequence+1,text,tone,channel,session:audience.session,created:event?.at??now},now);
  if(lines===current)return;
  sequence++;
  useCombatNotices.setState({lines});scheduleExpiry();
}

/** Existing ability call sites share the same notification pipeline. */
export function announceCombat(text:string,tone:NoticeTone='warning',event?:NoticeEvent){
  announceGame(text,tone,channelForTone(tone),event);
}

export function clearCombatNotices() {
  clearTimeout(expiry);expiry=undefined;deadline=0;
  if (useCombatNotices.getState().lines.length) useCombatNotices.setState({lines: []});
}

/** Muting a channel discards its queued entries; enabling it cannot replay
 * notifications that happened while that channel was disabled. */
export function discardMutedNotices(channels:Record<NoticeChannel,boolean>){
  const current=useCombatNotices.getState().lines;
  const kept=current.filter(line=>channels[line.channel]);
  if(kept.length!==current.length){useCombatNotices.setState({lines:kept});scheduleExpiry();}
}
