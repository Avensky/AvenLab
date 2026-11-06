/** Shared in-game notification vocabulary for combat, mobility and world events. */
export const NOTICE_CHANNELS=['combat','effects','system','objectives','rescue'] as const;
export type NoticeChannel=typeof NOTICE_CHANNELS[number];
export type NoticeTone='damage'|'buff'|'debuff'|'warning'|'system'|'objective'|'rescue';
export const DEFAULT_NOTICE_CHANNELS:Record<NoticeChannel,boolean>={
  combat:true,effects:true,system:true,objectives:true,rescue:true,
};
export const NOTICE_LABELS:Record<NoticeChannel,string>={
  combat:'Combat hits & weapon events',effects:'Buffs, debuffs & nitrous',
  system:'Respawn & system warnings',objectives:'Flags & match objectives',
  rescue:'Rescue and fleet alerts',
};
export function channelForTone(tone:NoticeTone):NoticeChannel {
  if(tone==='buff'||tone==='debuff')return 'effects';
  if(tone==='damage')return 'combat';
  if(tone==='objective')return 'objectives';
  if(tone==='rescue')return 'rescue';
  return 'system';
}
export function sanitizeNoticeChannels(value:unknown):Record<NoticeChannel,boolean>{
  const input=value&&typeof value==='object'?value as Partial<Record<NoticeChannel,unknown>>:{};
  return Object.fromEntries(NOTICE_CHANNELS.map(channel=>
    [channel,typeof input[channel]==='boolean'?input[channel]:DEFAULT_NOTICE_CHANNELS[channel]]
  )) as Record<NoticeChannel,boolean>;
}
