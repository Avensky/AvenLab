import {useCombatStore} from './combatStore';
import {setTurretEnabled} from './turretControls';
import {MountPicker} from './MountPicker';

export function WeaponEditor({vehicle,onTest}:{vehicle:string;onTest?:()=>void}) {
  const enabled=useCombatStore(s=>s.enabled);
  if(!vehicle)return <p>Wait for the vehicle configuration.</p>;
  return <>
    <MountPicker vehicle={vehicle}/>
    <div className="ve-weapon-toolbar">
      <label><input type="checkbox" checked={enabled} onChange={e=>setTurretEnabled(e.target.checked)}/> Turret controls</label>
      <button onClick={()=>{setTurretEnabled(true);onTest?.();}}>TEST TURRET CONTROLS</button>
      <button disabled={!enabled} onClick={()=>setTurretEnabled(false)}>STOP TURRET TEST</button>
    </div>
    <p>{vehicle==='tank'?'The cannon and the selected secondary gun reload independently.':'The roof mount uses this vehicle’s server-defined firing position.'}</p>
  </>;
}
