import type {PhysicsEntitySnapshot,PhysicsSnapshot} from '../store/session/networkStore';

import {showVehicleHealthBar,type HealthBarMode} from '../store/preferences/healthVisibility';

type RecoveryHealth=Pick<NonNullable<PhysicsEntitySnapshot['health']>,'defeated'|'respawn_remaining_s'|'recovery_window_s'|'disabled_reason'>;
export type RecoveryStatus={remaining:number;window:number|null;progress:number|null;reason:'combat'|'fuel';revivable:boolean};
/** Only server timers drive this countdown. Older servers may publish a respawn
 * countdown without supporting teammate recovery; its ring stays unavailable. */
export function recoveryStatus(health:RecoveryHealth|undefined):RecoveryStatus|null{
 if(!health?.defeated)return null;
 const remaining=Number.isFinite(health.respawn_remaining_s)?Math.max(0,health.respawn_remaining_s):0;
 const window=typeof health.recovery_window_s==='number'&&Number.isFinite(health.recovery_window_s)&&health.recovery_window_s>0?health.recovery_window_s:null;
 return {remaining,window,progress:window===null?null:Math.min(1,remaining/window),reason:health.disabled_reason==='fuel'?'fuel':'combat',revivable:window!==null&&remaining>0};
}

/** Downed vehicles, including self, retain critical recovery feedback even
 * when the player hides ordinary HP bars. Other rooms never contribute. */
export function healthMarkerIds(snapshot:PhysicsSnapshot|null,playerId:string,mode:HealthBarMode,targetId?:string|null):string[]{
 const me=snapshot?.entities.find(entity=>entity.id===playerId);
 if(!me)return [];
 return (snapshot?.entities??[]).filter(entity=>entity.health&&entity.room_id===me.room_id&&(entity.health.defeated||(entity.id!==playerId&&(entity.id===(targetId??me.combat?.assisted_target)||showVehicleHealthBar(mode,entity.team,false))))).slice(0,10).map(entity=>entity.id);
}
