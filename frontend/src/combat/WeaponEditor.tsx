import { DEFAULT_MOUNT,useCombatStore } from './combatStore';
import {setTurretEnabled} from './turretControls';
export function WeaponEditor({vehicle,onTest}:{vehicle:string;onTest?:()=>void}){
 const s=useCombatStore(),m=s.mounts[vehicle]??DEFAULT_MOUNT;
 if(!vehicle)return <p>Wait for the vehicle configuration.</p>;
 const tank=vehicle==='tank';
 return <><div className="ve-weapon-toolbar"><label><input type="checkbox" checked={s.enabled} onChange={e=>setTurretEnabled(e.target.checked)}/> Turret controls</label><button onClick={()=>{setTurretEnabled(true);onTest?.();}}>TEST TURRET CONTROLS</button><button disabled={!s.enabled} onClick={()=>setTurretEnabled(false)}>STOP TURRET TEST</button></div>
 {tank?<><h3>FACTORY TURRET & CANNON</h3><p>Original GLB parts. Independent yaw/elevation, one-shell reload and physical recoil. Mount/collision pivots follow the supplied model.</p></>:<><label>Weapon<select value={m.role} onChange={e=>s.setMount(vehicle,{...m,role:e.target.value as typeof m.role})}><option value="assault">Twin automatic guns</option><option value="support">Support machine gun</option><option value="medic">Precision medic (healing pending)</option></select></label>{(['x','y','z'] as const).map(axis=><label key={axis}>Mount {axis.toUpperCase()} (m)<input type="number" min={-3} max={3} step={.05} value={m[axis]} onChange={e=>{const v=e.target.valueAsNumber;if(Number.isFinite(v))s.setMount(vehicle,{...m,[axis]:Math.max(-3,Math.min(3,v))});}}/></label>)}<button onClick={()=>s.setMount(vehicle,{...DEFAULT_MOUNT})}>RESET WEAPON MOUNT</button></>}
 <p>Instructions are in Cockpit → Missions. Turret bearing/reload are in the instruments.</p></>;
}
