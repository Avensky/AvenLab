/** One saved display policy shared by local HP and remote markers. Team names
 * come from authoritative snapshots; this never changes damage or ownership. */
export const HEALTH_BAR_MODES=['all','red','blue','none','others'] as const;
export type HealthBarMode=typeof HEALTH_BAR_MODES[number];
export const HEALTH_BAR_LABELS:Record<HealthBarMode,string>={
 all:'Show all',red:'Show red team',blue:'Show blue team',none:'Hide all',others:'Hide self',
};
export function sanitizeHealthBarMode(value:unknown):HealthBarMode{
 return HEALTH_BAR_MODES.includes(value as HealthBarMode)?value as HealthBarMode:'all';
}
export function cycleHealthBarMode(mode:HealthBarMode,direction:1|-1=1):HealthBarMode{
 return HEALTH_BAR_MODES[(HEALTH_BAR_MODES.indexOf(mode)+direction+HEALTH_BAR_MODES.length)%HEALTH_BAR_MODES.length];
}
export function showVehicleHealthBar(mode:HealthBarMode,team:string|undefined,isSelf:boolean):boolean{
 if(mode==='none')return false;
 if(mode==='others')return !isSelf;
 if(mode==='red'||mode==='blue')return team?.toLowerCase()===mode;
 return true;
}
