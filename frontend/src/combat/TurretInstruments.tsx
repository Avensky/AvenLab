import { Quaternion, Vector3 } from 'three';
import { useNetworkStore } from '../store/session/networkStore';
import './turretControls.css';

/** Compact, confirmed hull-relative bearing; no floating debug card. */
export function TurretInstruments() {
  const value = useNetworkStore(s => {
    const me = s.snapshot?.entities.find(e => e.id === s.playerId);
    const turret = me?.combat;
    if (!me || !turret || (!turret.enabled && turret.role !== 'tank')) return '';
    const local = new Vector3(
      -Math.sin(turret.yaw) * Math.cos(turret.pitch),
      Math.sin(turret.pitch),
      -Math.cos(turret.yaw) * Math.cos(turret.pitch),
    ).applyQuaternion(new Quaternion(...me.rotation).invert());
    const bearing = Math.round(Math.atan2(local.x, local.z) * 180 / Math.PI);
    const elevation = Math.round(Math.atan2(local.y, Math.hypot(local.x, local.z)) * 180 / Math.PI);
    const ready = (turret.stun_remaining??0)>0 ? `STUN ${turret.stun_remaining!.toFixed(1)}s` : !turret.enabled ? 'SAFE'
      : turret.reload && turret.reload > 0 ? `${turret.weapon==='coax'||turret.weapon==='basket'?'CYCLE':'LOAD'} ${turret.reload.toFixed(1)}s` : 'READY';
    return `TURRET ${bearing}° · ELEV ${elevation}°${turret.role === 'tank' ? ` · ${ready}` : ''}`;
  });
  return value ? <div className="turret-instruments" aria-label="Turret instruments">{value}</div> : null;
}
