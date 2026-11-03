import { useUIStore } from "../../store/menus";
import { useMissionRadioStore } from "../../store/missions";
import { useNavigationStore } from "../../store/world";
export function MissionApps() {
  const mission = useNavigationStore((s) => s.mission),
    history = useMissionRadioStore((s) => s.history);
  return (
    <section className="mission-apps" aria-label="Mission radio apps">
      <details><summary>Tank / turret controls</summary><p>Tank controls start ON. Edit Vehicle on the world HUD → Weapons can disable the test. Steer with the left stick; aim with the right stick; RB fires. Mobile uses AIM / FIRE below the shifter. Hide either in Settings → HUD or Cockpit → Turret. R3 toggles HULL LOCK / FREE AIM. LB / Shift / RAM starts a four-second forward charge; brake cancels it. Cooldown is 16 seconds from activation. Bearing and elevation appear in Climate HUD. Tap the bottom weapon slots, press Y on the controller, or V on the keyboard to cycle Cannon / Coax MG. Release RB after switching before firing again. The cannon has a single shell and automatic reload; recoil rocks the hull. The coax is an automatic small-arms test; vehicle damage and finished effects remain pending. Steering alone pivots; throttle plus steering makes a tighter moving turn. Permanent land bridges ignore damage.</p></details>
      <h2>{mission?.title ?? "Free drive"}</h2>
      <p>
        {mission?.objective ??
          "No active mission. Explore the city or choose a mission from the pause menu."}
      </p>
      <div className="headunit-apps">
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
      {!!history.length && (
        <div className="mission-radio-history" aria-label="Mission bulletins">
          {history.map((notice) => (
            <article key={notice.id}>
              <strong>
                {notice.kind === "complete" ? "MISSION COMPLETE · " : ""}
                {notice.title}
              </strong>
              <p>{notice.message}</p>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
