import { useMotionView } from "../../store/session/networkViews";
import {useUIStore} from "../../store/menus";
import {useMissionRadioStore} from "../../store/missions";

import {useNavigationStore} from "../../store/world";
import {ctfObjectiveLine} from "../../game/stats/ctfObjective";
import { ControlGlyph } from "../../components/controller";

/** The head unit carries the current instruction and the last bulletin. The
 * mission log owns the explanations and the full history. */
export function MissionApps() {
  const objective=useMotionView(ctfObjectiveLine);
  const missionTitle=useNavigationStore(s=>s.mission?.title);
  const bulletin=useMissionRadioStore(s=>s.current?.title);
  const title=objective??missionTitle??"Free drive";
  return <ul className="mission-apps mission-summary" aria-label="Mission list">
    <li><button type="button" aria-label={`Open mission log · ${title}`} title={title} onClick={()=>useUIStore.getState().setOverlay("missions")}>
      <span>{title}</span><ControlGlyph keyboard="L" />
    </button></li>
    {bulletin && bulletin!==objective && <li aria-live="polite">{bulletin}</li>}
  </ul>;
}
