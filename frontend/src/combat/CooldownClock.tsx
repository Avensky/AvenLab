import type {ReactNode} from 'react';
import {ProgressOrbit} from '../components/controller/ProgressOrbit';
import {cooldownProgress} from './weaponCooldown';
import {useNetworkStore} from '../store/session/networkStore';
import {useCombatStore,type TankWeapon} from './combatStore';
import './turretControls.css';
/** All server reload timers advance while holstered; a switch never resets a reload. */
export function CooldownClock({weapon,children}:{weapon:TankWeapon|'primary';children?:ReactNode}){
 const remaining=useNetworkStore(s=>{const c=s.getMe()?.combat;return weapon==='primary'?c?.reload:(weapon==='cannon'?c?.cannon_reload:weapon==='basket'?c?.basket_reload:c?.coax_reload)??(c?.weapon===weapon?c.reload:undefined);});
 const medic=useNetworkStore(s=>s.getMe()?.combat?.role==='medic');
 return <CooldownDial progress={cooldownProgress(remaining,weapon==='cannon'?3:weapon==='primary'&&medic ? 0.6 : 0.1)}>{children}</CooldownDial>;
}
export function SelectedCooldownClock({children}:{children?:ReactNode}){const weapon=useCombatStore(s=>s.weapon),tank=useNetworkStore(s=>s.getMe()?.vehicle_id==='tank');return <CooldownClock weapon={tank?weapon:'primary'}>{children}</CooldownClock>;}
export function CooldownDial({progress,children,label}:{progress:number|null;children?:ReactNode;label?:string}){return <ProgressOrbit layered className="cooldown-clock" progress={progress} label={label??(progress===null?'Cooldown unavailable':progress===1?'Weapon ready':'Weapon cooling down')}>{children}</ProgressOrbit>;}
