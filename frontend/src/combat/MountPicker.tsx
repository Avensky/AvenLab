import {useMotionView} from '../store/session/networkViews';
import {useCombatStore, DEFAULT_MOUNT, type WeaponMount} from './combatStore';
import {TANK_SECONDARIES} from './tankLoadout';
import {isMechanicPlayer} from './reviveTargets';
import './weaponSelector.css';

const roadMounts: {role:WeaponMount['role']; name:string; detail:string}[] = [
  {role:'assault',name:'Factory guns',detail:'Original roof mount'},
  {role:'support',name:'M2 Browning',detail:'Single tripod-mounted machine gun'},
  {role:'medic',name:'Precision gun',detail:'Single barrel · slower fire'},
];

export function MountPicker({vehicle}:{vehicle:string}) {
  const mount=useCombatStore(s=>s.mounts[vehicle] ?? DEFAULT_MOUNT);
  const secondary=useCombatStore(s=>s.secondaryWeapon);
  const dedicated=useMotionView(s=>s.getMe()?.vehicle_id===vehicle ?
    isMechanicPlayer(s) ? 'Mechanic health packs' :
    s.getMe()?.combat?.weapon==='spray' ? 'Support spray' : null : null);
  if (!vehicle) return null;
  if (dedicated) return <p>Hero weapon · {dedicated}</p>;
  const tank = vehicle==='tank';
  return <fieldset className="mount-picker">
    <legend>{tank?'Secondary gun':'Roof mount'}</legend>
    {tank && <p>Primary · Factory cannon</p>}
    {tank ? TANK_SECONDARIES.map(definition=><button key={definition.id} type="button"
      aria-pressed={secondary===definition.id} onClick={()=>useCombatStore.getState().selectSecondary(definition.id)}>
      <strong>{definition.id==='roof-mg'?'Roof machine gun':'Forward coaxial gun'}</strong>
      <small>{definition.rangeMeters} m</small></button>) :
      roadMounts.map(choice=><button key={choice.role} type="button" aria-pressed={mount.role===choice.role}
        onClick={()=>useCombatStore.getState().setMount(vehicle,{...mount,role:choice.role})}>
        {choice.role==='support' && <img src="/images/m2-browning.webp" alt="" width="90" height="32"/>}
        <strong>{choice.name}</strong><small>{choice.detail}</small></button>)}
  </fieldset>;
}
