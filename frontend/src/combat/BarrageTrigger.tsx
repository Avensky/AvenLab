import {useNetworkStore} from '../store/session/networkStore';
import {barrageReady,requestTankBarrage} from './tankBarrage';
export function BarrageTrigger(){
  const ready=useNetworkStore(barrageReady);
  const seconds=useNetworkStore(s=>Math.ceil((s.getMe()?.barrage?.ticks_left??0)/60));
  return <button type="button" className="barrage-trigger" disabled={!ready} aria-label="Activate tank barrage"
    title={seconds?`Barrage active · ${seconds}s`:'Barrage · 5 seconds · 45 m · requires full Ultimate charge'} onClick={()=>void requestTankBarrage()}>
    {seconds>0 && <span className="barrage-time">{seconds}s</span>}
  </button>;
}
