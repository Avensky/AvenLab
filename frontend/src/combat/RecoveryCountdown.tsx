import {ProgressOrbit} from '../components/controller/ProgressOrbit';
import type {RecoveryStatus} from './recoveryStatus';
import './recoveryCountdown.css';

/** A shared recovery countdown for the overhead marker and the local readout. */
export function RecoveryCountdown({status}:{status:RecoveryStatus}){
 const seconds=Math.ceil(status.remaining);
 return <div className="recovery-countdown" data-reason={status.reason} data-revivable={status.revivable} role="timer" aria-label={status.revivable?`Mechanic recovery window ${seconds} seconds`:status.remaining>0?`Respawn in ${seconds} seconds`:'Waiting for safe spawn'}>
  <ProgressOrbit layered progress={status.progress} label={status.revivable?'Time available for mechanic revival':'Recovery countdown'}><strong>{seconds>0?seconds:'…'}</strong></ProgressOrbit>
 </div>;
}
