import { useUIStore } from "../../store/menus";
import { useMissionRadioStore } from "../../store/missions";
import { useNavigationStore } from "../../store/world";
export function MissionApps() {
  const mission = useNavigationStore((s) => s.mission),
    history = useMissionRadioStore((s) => s.history);
  return (
    <section className="mission-apps" aria-label="Mission radio apps">
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
