import { useMotionView } from "../store/session/networkViews";
import type {ReactNode} from 'react';
import {ProgressOrbit} from '../components/controller/ProgressOrbit';
import {cooldownProgress,displayReload,weaponReload} from './weaponCooldown';

import {useCombatStore,type TankWeapon} from './combatStore';
import './turretControls.css';
/** All server reload timers advance while holstered; a switch never resets a reload. */
export function CooldownClock({weapon,children}:{weapon:TankWeapon|'primary';children?:ReactNode}){
 const remaining=useMotionView(s=>displayReload(weaponReload(s.getMe()?.combat,weapon)));
 const emptySpray=useMotionView(s=>weapon==='primary'&&s.getMe()?.vehicle_id==='cx30'&&s.getMe()?.combat?.ammo===0);
 const medic=useMotionView(s=>s.getMe()?.combat?.role==='medic');
 return <CooldownDial progress={cooldownProgress(remaining,weapon==='cannon'?3:emptySpray?2.5:weapon==='primary'&&medic ? 0.6 : 0.1)}>{children}</CooldownDial>;
}
export function SelectedCooldownClock({children}:{children?:ReactNode}){const weapon=useCombatStore(s=>s.weapon),tank=useMotionView(s=>s.getMe()?.vehicle_id==='tank');return <CooldownClock weapon={tank?weapon:'primary'}>{children}</CooldownClock>;}
export function CooldownDial({progress,children,label}:{progress:number|null;children?:ReactNode;label?:string}){return <ProgressOrbit layered className="cooldown-clock" progress={progress} label={label??(progress===null?'Cooldown unavailable':progress===1?'Weapon ready':'Weapon cooling down')}>{children}</ProgressOrbit>;}
