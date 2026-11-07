import type {NoticeChannel,NoticeTone} from './noticeModel.ts';

export const NOTICE_LIFETIME_MS=1600;
export const NOTICE_CAPACITY=3;
export const NOTICE_EVENT_MAX_AGE_MS=1000;
export type GameNotice={
  id:number;text:string;tone:NoticeTone;channel:NoticeChannel;
  session:string;created:number;expires:number;slot:number;
};

/** Pure queue operations keep timers, presentation and socket cadence separate.
 * Retain the same array when nothing changes: expiry must not cause idle redraws. */
export function pruneNotices(lines:GameNotice[],now:number,session?:string):GameNotice[]{
  if(lines.every(line=>line.expires>now&&(session===undefined||line.session===session)))return lines;
  return lines.filter(line=>line.expires>now&&(session===undefined||line.session===session));
}

export function enqueueNotice(lines:GameNotice[],notice:Omit<GameNotice,'slot'|'expires'>,now:number):GameNotice[]{
  const live=pruneNotices(lines,now,notice.session);
  const text=notice.text.trim().replace(/\s+/g,' ').slice(0,180);
  if(!text||!Number.isFinite(notice.created)||notice.created>now||now-notice.created>NOTICE_EVENT_MAX_AGE_MS)return live;
  if(live.some(line=>line.text===text&&line.channel===notice.channel))return live;
  const kept=live.slice(-(NOTICE_CAPACITY-1));
  const slot=Array.from({length:NOTICE_CAPACITY},(_,i)=>i).find(i=>kept.every(line=>line.slot!==i))!;
  return [...kept,{...notice,text,slot,expires:notice.created+NOTICE_LIFETIME_MS}];
}
