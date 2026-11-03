import {canDrive} from '../controls/inputRouting';
import {useNetworkStore} from '../store/session/networkStore';
import {triggerRam} from './turretControls';
import {CooldownDial} from './CooldownClock';
import {AttackIcon} from './AttackIcon';
import {cooldownProgress} from './weaponCooldown';
export function RamAttack(){
 const charge=useNetworkStore(s=>s.getMe()?.combat?.ram_charge_remaining??0);
 const blocked=useNetworkStore(s=>s.getMe()?.combat?.ram_blocked??'');
 const engineOn=useNetworkStore(s=>Boolean((s.getMe()?.vehicle_mask??0)&1)),active=useNetworkStore(s=>s.getMe()?.combat?.ram_remaining??0),cooldown=useNetworkStore(s=>s.getMe()?.combat?.ram_cooldown);
 return <button type="button" className="ram-attack" aria-label="Ram attack" data-ready={cooldown===0&&!blocked} data-active={active>0} title="Launch forward, charge for 3 seconds, then 4 seconds reduced boost · 60 second cooldown · enemy contact stuns for 1 second · LB / Shift. Requires engine, drive gear, grounded tracks and released brakes." disabled={!canDrive()||!engineOn||Boolean(blocked)||cooldown===undefined||cooldown>0} onClick={triggerRam}>
  <CooldownDial progress={blocked&&cooldown===0?null:cooldownProgress(cooldown,60)}><AttackIcon kind="ram"/></CooldownDial><span className="attack-label">{active>0?`${charge>0?'CHARGE':'BOOST'} ${(charge>0?charge:active).toFixed(1)}s`:blocked||'RAM'}<small>LB · SHIFT</small></span>
 </button>;
}
