import {AttackIcon} from './AttackIcon';
import {CooldownDial} from './CooldownClock';
import {useNetworkStore} from '../store/session/networkStore';
import {barrageReady,requestTankBarrage} from './tankBarrage';
export function BarrageTrigger({tile=false}:{tile?:boolean}={}){
  const ready=useNetworkStore(barrageReady);
  const charge=useNetworkStore(s=>tile?Math.round((s.getMe()?.ultimate_fraction??0)*100)/100:0);
  const seconds=useNetworkStore(s=>Math.ceil((s.getMe()?.barrage?.ticks_left??0)/60));
  return <button type="button" className={tile?'barrage-action':'barrage-trigger'} disabled={!ready} aria-label="Activate Barrage Ultimate"
    title={seconds?`Barrage active · ${seconds}s`:'Barrage · 5 seconds · 45 m · requires full Ultimate charge'} onClick={()=>void requestTankBarrage()}>
    {tile && <><CooldownDial progress={charge}><AttackIcon kind="cannon"/></CooldownDial><span>BARRAGE</span></>}
    {seconds>0 && <span className="barrage-time">{seconds}s</span>}
  </button>;
}
