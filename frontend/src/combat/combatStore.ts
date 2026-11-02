import { create } from 'zustand';
import { persist } from 'zustand/middleware';
export type WeaponMount = { role: 'assault'|'support'|'medic'; x:number;y:number;z:number };
export const DEFAULT_MOUNT: WeaponMount = {role:'assault',x:0,y:1.1,z:0};
export const combatIntent = { enabled:false, yaw:0, pitch:0, fire:false, gamepadFire:false };
export const useCombatStore = create(persist<{enabled:boolean;mounts:Record<string,WeaponMount>;setEnabled:(enabled:boolean)=>void;setMount:(id:string,m:WeaponMount)=>void}>((set)=>({enabled:false,mounts:{},setEnabled:enabled=>{combatIntent.enabled=enabled;combatIntent.fire=false;combatIntent.gamepadFire=false;set({enabled});},setMount:(id,m)=>set(s=>({mounts:{...s.mounts,[id]:m}}))}),{name:'avenlab-weapon-mounts-v1',partialize:s=>({...s,enabled:false})}));
export function aimCombat(dx:number,dy:number){if(!combatIntent.enabled||!Number.isFinite(dx)||!Number.isFinite(dy))return;combatIntent.yaw=Math.atan2(Math.sin(combatIntent.yaw-dx),Math.cos(combatIntent.yaw-dx));combatIntent.pitch=Math.max(-Math.PI/4,Math.min(Math.PI/4,combatIntent.pitch-dy));}
