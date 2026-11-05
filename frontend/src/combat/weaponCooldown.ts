import type {PhysicsEntitySnapshot} from '../store/session/networkStore';

export type ReloadWeapon = 'primary'|'cannon'|'coax'|'basket';
/** One authoritative slot lookup shared by the button, ring and text display. */
export function weaponReload(combat:PhysicsEntitySnapshot['combat'],weapon:ReloadWeapon):number|undefined {
  if(!combat)return undefined;
  const value=weapon==='primary'?combat.reload:
    (weapon==='cannon'?combat.cannon_reload:weapon==='basket'?combat.basket_reload:combat.coax_reload)
      ??(combat.weapon===weapon?combat.reload:undefined);
  return value===undefined||!Number.isFinite(value)?undefined:Math.max(0,value);
}

/** Quantize visual work only. Input/fire eligibility still reads server state.
 * Ceiling keeps any positive remainder cooling, even the final fraction. */
export function displayReload(remaining:number|undefined,hz=20):number|undefined {
  return remaining===undefined?undefined:Math.ceil(remaining*hz)/hz;
}

export function reloadState(remaining:number|undefined) {
  return remaining===undefined?'waiting':remaining>0?'cooling':'ready';
}

export function cooldownProgress(remaining:number|undefined,duration:number){
  return remaining===undefined||!Number.isFinite(remaining)||!(duration>0)?null:Math.max(0,Math.min(1,1-remaining/duration));
}
