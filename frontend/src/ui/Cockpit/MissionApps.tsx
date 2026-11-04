import {getCtfCaptureObjective} from "../../game/stats/ctfObjective";
import {useNetworkStore} from "../../store/session/networkStore";
import "../../game/stats/ctfMatch.css";
import {openHeroGuide} from "../../store/hud/heroGuideStore";
import {useScoreboardStore} from "../../store/hud/scoreboardStore";
import { useUIStore } from "../../store/menus";
import { useMissionRadioStore } from "../../store/missions";
import { useNavigationStore } from "../../store/world";
export function MissionApps() {
  const mission = useNavigationStore((s) => s.mission),
    history = useMissionRadioStore((s) => s.history);
  const snapshot = useNetworkStore((s) => s.snapshot), playerId = useNetworkStore((s) => s.playerId);
  const match = snapshot?.match_state;
  const objective = match ? getCtfCaptureObjective(match, snapshot.entities.find((entity) => entity.id === playerId)) : null;
  return (
    <section className="mission-apps" aria-label="Mission radio apps">
      <h2>{match ? "CAPTURE THE FLAG" : mission?.title ?? "Free drive"}</h2>
      {!!history.length && (
        <div className="mission-radio-history" aria-label="Mission bulletins" role="log" aria-live="polite" aria-relevant="additions">
          {history.map((notice) => (
            <article key={notice.id} data-source={notice.source}>
              <strong>
                {notice.kind === "complete" ? "MISSION COMPLETE · " : ""}
                {notice.title}
              </strong>
              <p>{notice.message}</p>
            </article>
          ))}
        </div>
      )}
      {match ? <details className="ctf-mission-objective"><summary>OBJECTIVE · OWN FLAG MUST BE HOME</summary><div>
        <strong>{match.phase === "waiting" ? "WARMUP · NO SCORING" : match.phase === "ended" ? "ROUND COMPLETE" : "BRING THE ENEMY FLAG HOME"}</strong>
        <p>{objective?.state === "blocked" ? "Your flag is away from home. Recover it before scoring; you may keep the enemy flag while teammates return yours." : objective ? `Bring the enemy flag to your ${objective.team.toUpperCase()} home-base ring · ${Math.ceil(objective.distance)} m.` : "Touch the enemy flag, then bring it to your own home-base ring. Your own flag must be at home to score."}</p>
        <p>Touch your dropped flag to return it. A dropped enemy flag can be picked up. The carrier moves 20% slower and takes 20% more damage.</p>
      </div></details> : <p>{mission?.objective ?? "No active mission. Explore the city or choose a mission from the pause menu."}</p>}
      <details><summary>Driving and combat help</summary><p>Hold Tab for session statistics. Open the hero guide with F1 for current weapon controls, abilities, costs, and status descriptions.</p></details>
      <div className="headunit-apps">
        <button type="button" onClick={() => {useUIStore.getState().closeOverlay();useScoreboardStore.getState().toggle();}}>MATCH STATS · TAB</button>
        <button type="button" onClick={() => openHeroGuide()}>HERO ABILITIES · F1</button>
        <button
          type="button"
          disabled={!mission?.target}
          onClick={() => {
            if (mission?.target)
              useNavigationStore.getState().setDestination(mission.target);
          }}
        >
          TRACK OBJECTIVE
        </button>
        <button
          type="button"
          onClick={() => useUIStore.getState().openCockpit("navigation")}
        >
          GPS
        </button>
        <button
          type="button"
          onClick={() => useUIStore.getState().openCockpit("radio")}
        >
          RADIO
        </button>
      </div>

    </section>
  );
}
