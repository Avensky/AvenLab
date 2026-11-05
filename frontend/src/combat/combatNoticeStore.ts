import {create} from 'zustand';

export type NoticeTone = 'warning' | 'damage' | 'buff';
type Notice = { id: number; text: string; tone: NoticeTone; expires: number };
export const useCombatNotices = create<{ lines: Notice[] }>(() => ({ lines: [] }));
let sequence = 0;
const lifetime = 1900;

export function announceCombat(text: string, tone: NoticeTone = 'warning') {
  const now = performance.now();
  const current = useCombatNotices.getState().lines;
  if (!text || current.some(n => n.text === text && n.tone === tone && n.expires > now)) return;
  const lines = current.filter(n => n.expires > now).slice(-2);
  useCombatNotices.setState({lines: [...lines, {id: ++sequence, text, tone, expires: now + lifetime}]});
}

export function clearCombatNotices() {
  if (useCombatNotices.getState().lines.length) useCombatNotices.setState({lines: []});
}
