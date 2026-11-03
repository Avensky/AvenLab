import {usePreferencesStore} from '../store/preferences/preferencesStore';
import {create} from 'zustand';
import {persist} from 'zustand/middleware';

export type WeaponMount={role:'assault'|'support'|'medic';x:number;y:number;z:number};
export type TankWeapon='cannon'|'coax';
export const DEFAULT_MOUNT:WeaponMount={role:'assault',x:0,y:1.1,z:0};
export const combatIntent={ramPulseUntil:0,orientationLocked:true,ram:false,gamepadRam:false,keyboardRam:false,weapon:'cannon' as TankWeapon,enabled:false,yaw:0,pitch:0,fire:false,keyboardFire:false,gamepadFire:false};
type CombatState={
  enabled:boolean;
  scope:boolean;
  scopeZoom:2|4;
  setScopeZoom:(zoom:2|4)=>void;
  setScope:(scope:boolean)=>void;
  orientationLocked:boolean;
  setOrientationLocked:(locked:boolean)=>void;
  weapon:TankWeapon;
  mounts:Record<string,WeaponMount>;
  selectWeapon:(weapon:TankWeapon)=>void;
  setEnabled:(enabled:boolean)=>void;
  setMount:(id:string,mount:WeaponMount)=>void;
};
export const useCombatStore=create<CombatState>()(persist((set)=>({
  scopeZoom:2,setScopeZoom:scopeZoom=>set({scopeZoom}),
  scope:false,setScope:scope=>{if(scope){combatIntent.orientationLocked=false;set({scope,orientationLocked:false});}else set({scope});},
  enabled:false,orientationLocked:true,weapon:'cannon',mounts:{},
  setOrientationLocked:orientationLocked=>{combatIntent.orientationLocked=orientationLocked;set({orientationLocked});},
  selectWeapon:weapon=>{
    if(weapon!=='cannon'&&weapon!=='coax')return;
    combatIntent.weapon=weapon;
    combatIntent.fire=false;combatIntent.keyboardFire=false;
    combatIntent.gamepadFire=false;
    set({weapon});
  },
  setEnabled:enabled=>{
    combatIntent.enabled=enabled;
    combatIntent.ramPulseUntil=0;
    if(!enabled)set({scope:false});
    combatIntent.ram=false;combatIntent.gamepadRam=false;combatIntent.keyboardRam=false;
    combatIntent.fire=false;combatIntent.keyboardFire=false;
    combatIntent.gamepadFire=false;
    set({enabled});
  },
  setMount:(id,mount)=>set(s=>({mounts:{...s.mounts,[id]:mount}})),
}),{name:'avenlab-weapon-mounts-v1',partialize:s=>({mounts:s.mounts})}));
export function aimCombat(dx:number,dy:number){
  if(!combatIntent.enabled||!Number.isFinite(dx)||!Number.isFinite(dy))return;
  const sensitivity=usePreferencesStore.getState();
  dx*=sensitivity.turretYawSensitivity;dy*=sensitivity.turretPitchSensitivity;
  if(!combatIntent.orientationLocked)combatIntent.yaw=Math.atan2(Math.sin(combatIntent.yaw-dx),Math.cos(combatIntent.yaw-dx));
  if(!combatIntent.orientationLocked)combatIntent.pitch=Math.max(-Math.PI/4,Math.min(Math.PI/4,combatIntent.pitch-dy));
}
