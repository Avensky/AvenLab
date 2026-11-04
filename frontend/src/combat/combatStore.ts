import {createTankFireInputs,clearTankFireInputs,type TankSecondary} from './tankLoadout';
import {usePreferencesStore} from '../store/preferences/preferencesStore';
import {create} from 'zustand';
import {persist} from 'zustand/middleware';

export type WeaponMount={role:'assault'|'support'|'medic';x:number;y:number;z:number};
export type TankWeapon='cannon'|'coax'|'basket';
export const TURRET_RESET_COOLDOWN_MS=1000;
export const TURRET_LOCK_COOLDOWN_MS=250;
export const DEFAULT_MOUNT:WeaponMount={role:'assault',x:0,y:1.1,z:0};
export const tankFireInputs=createTankFireInputs();
export const combatIntent={firePulseUntil:0,directWeaponHeld:null as TankWeapon|null,scopeRelockPending:false,resetRelockAt:0,ramPulseUntil:0,orientationLocked:true,ram:false,gamepadRam:false,keyboardRam:false,weapon:'cannon' as TankWeapon,enabled:false,yaw:0,pitch:0,fire:false,keyboardFire:false,gamepadFire:false};
type CombatState={
  enabled:boolean;
  turretResetReadyAt:number;
  turretLockReadyAt:number;
  scope:boolean;
  scopeLockBefore:boolean|null;
  scopeZoom:2|4;
  setScopeZoom:(zoom:2|4)=>void;
  setScope:(scope:boolean)=>void;
  orientationLocked:boolean;
  setOrientationLocked:(locked:boolean)=>void;
  weapon:TankWeapon;
  secondaryWeapon:TankSecondary;
  selectSecondary:(weapon:TankSecondary)=>void;
  mounts:Record<string,WeaponMount>;
  selectWeapon:(weapon:TankWeapon)=>void;
  setEnabled:(enabled:boolean)=>void;
  setMount:(id:string,mount:WeaponMount)=>void;
};
export const useCombatStore=create<CombatState>()(persist((set,get)=>({
  scopeZoom:2,setScopeZoom:scopeZoom=>set({scopeZoom}),
  scope:false,scopeLockBefore:null,setScope:scope=>{
    const current=get();if(scope===current.scope)return;
    if(scope){const lockedBefore=current.orientationLocked||combatIntent.resetRelockAt>0;combatIntent.resetRelockAt=0;combatIntent.orientationLocked=false;combatIntent.scopeRelockPending=false;set({scope,scopeLockBefore:lockedBefore,orientationLocked:false});}
    else{const locked=current.scopeLockBefore??current.orientationLocked;combatIntent.orientationLocked=locked;combatIntent.scopeRelockPending=locked;set({scope,scopeLockBefore:null,orientationLocked:locked});}
  },
  turretLockReadyAt:0,turretResetReadyAt:0,enabled:false,orientationLocked:true,weapon:'cannon',secondaryWeapon:'roof-mg',mounts:{},
  selectSecondary:secondaryWeapon=>{
    if(secondaryWeapon!=='roof-mg'&&secondaryWeapon!=='forward-mg')return;
    for(const source of ['keyboard','gamepad','pointer'] as const){tankFireInputs[source].secondary=false;tankFireInputs[source].secondaryPulseUntil=0;}
    set({secondaryWeapon});
  },
  setOrientationLocked:orientationLocked=>{combatIntent.resetRelockAt=0;combatIntent.orientationLocked=orientationLocked;set({orientationLocked});},
  selectWeapon:weapon=>{
    if(weapon!=='cannon'&&weapon!=='coax'&&weapon!=='basket')return;
    clearTankFireInputs(tankFireInputs);
    combatIntent.firePulseUntil=0;combatIntent.directWeaponHeld=null;
    combatIntent.weapon=weapon;
    combatIntent.fire=false;combatIntent.keyboardFire=false;
    combatIntent.gamepadFire=false;
    set({weapon});
  },
  setEnabled:enabled=>{
    combatIntent.enabled=enabled;
    combatIntent.resetRelockAt=0;
    clearTankFireInputs(tankFireInputs);
    combatIntent.ramPulseUntil=0;
    if(!enabled)get().setScope(false);
    combatIntent.firePulseUntil=0;combatIntent.directWeaponHeld=null;
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
  if(dx!==0||dy!==0)combatIntent.resetRelockAt=0;
  dx*=sensitivity.turretYawSensitivity;dy*=sensitivity.turretPitchSensitivity;
  if(!combatIntent.orientationLocked)combatIntent.yaw=Math.atan2(Math.sin(combatIntent.yaw-dx),Math.cos(combatIntent.yaw-dx));
  if(!combatIntent.orientationLocked)combatIntent.pitch=Math.max(-Math.PI/4,Math.min(Math.PI/4,combatIntent.pitch-dy));
}
