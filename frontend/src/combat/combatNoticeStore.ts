import {create} from 'zustand';
import {channelForTone,type NoticeChannel,type NoticeTone} from './noticeModel';

export type {NoticeTone,NoticeChannel} from './noticeModel';
type Notice = { id: number; text: string; tone: NoticeTone; channel:NoticeChannel; expires: number };
export const useCombatNotices = create<{ lines: Notice[] }>(() => ({ lines: [] }));
let sequence = 0;
const lifetime = 1900;

export function announceGame(text:string,tone:NoticeTone='system',channel:NoticeChannel=channelForTone(tone)){
  const now = performance.now();
  const current = useCombatNotices.getState().lines;
  if (!text || current.some(n => n.text === text && n.channel===channel && n.expires > now)) return;
  const lines = current.filter(n => n.expires > now).slice(-3);
  useCombatNotices.setState({lines: [...lines, {id: ++sequence, text, tone, channel, expires: now + lifetime}]});
}

/** Existing ability call sites share the same notification pipeline. */
export function announceCombat(text:string,tone:NoticeTone='warning'){
  announceGame(text,tone,channelForTone(tone));
}

export function clearCombatNotices() {
  if (useCombatNotices.getState().lines.length) useCombatNotices.setState({lines: []});
}
