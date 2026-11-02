import { DEFAULT_MOUNT,useCombatStore } from './combatStore';
export function WeaponEditor({vehicle}:{vehicle:string}){
 const s=useCombatStore(),m=s.mounts[vehicle]??DEFAULT_MOUNT;
 if(!vehicle)return <p>Wait for the current vehicle configuration.</p>;
 return <><h3>WEAPON MOUNT · {vehicle}</h3><p>Local per-vehicle mount preset. Enable Combat Test in the driving HUD to preview and share the turret pose. Standalone structure hitscan is available; healing, vehicle damage and ultimates remain pending.</p><label>Weapon<select value={m.role} onChange={e=>s.setMount(vehicle,{...m,role:e.target.value as typeof m.role})}><option value="assault">Twin automatic guns</option><option value="support">Support machine gun</option><option value="medic">Six-shot precision medic</option></select></label>{(['x','y','z'] as const).map(axis=><label key={axis}>Mount {axis.toUpperCase()} (m)<input type="number" min={-3} max={3} step={0.05} value={m[axis]} onChange={e=>{const v=e.target.valueAsNumber;if(Number.isFinite(v))s.setMount(vehicle,{...m,[axis]:Math.max(-3,Math.min(3,v))});}}/></label>)}<button onClick={()=>s.setMount(vehicle,{...DEFAULT_MOUNT})}>RESET WEAPON MOUNT</button></>;
}
