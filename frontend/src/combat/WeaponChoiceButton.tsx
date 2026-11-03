import {AttackIcon} from './AttackIcon';
import {useCombatStore,type TankWeapon} from './combatStore';
import {useNetworkStore} from '../store/session/networkStore';
import {canAimTurret} from './turretControls';
import {CooldownClock} from './CooldownClock';
export function WeaponChoiceButton({weapon}:{weapon:TankWeapon}){
 const selected=useCombatStore(s=>s.weapon===weapon);
 const cooldown=useNetworkStore(s=>{const c=s.getMe()?.combat;return (weapon==='cannon'?c?.cannon_reload:c?.coax_reload)??(c?.weapon===weapon?c.reload:undefined);});
 const label=weapon==='cannon'?'CANNON':'COAX MG';
 return <button type="button" className="weapon-choice" aria-label={label} aria-pressed={selected} data-ready={cooldown===0} title={`${label} · ${cooldown===undefined?'Waiting for server':cooldown>0?'Cooling down':'Ready'}`} onClick={()=>{if(canAimTurret())useCombatStore.getState().selectWeapon(weapon);}}><CooldownClock weapon={weapon}><AttackIcon kind={weapon}/></CooldownClock><span>{label}</span></button>;
}
