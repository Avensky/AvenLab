import { memo, useState } from "react";
import { MissionApps } from "./MissionApps";
import { RadioPanel } from "./RadioPanel";
import { usePreferencesStore } from "../../store/preferences/preferencesStore";
import { useMomentaryFeedback } from "./useMomentaryFeedback";
/** The driving head unit contains media and mission tools. Settings and research
 * live in their own menu, so idle cabin masks never subscribe this whole panel. */
export const ConsoleDisplay = memo(function ConsoleDisplay({
  onMinimize,
  showRadio = true,
  showMissions = true,
}: {
  onMinimize?: () => void;
  showRadio?: boolean;
  showMissions?: boolean;
}) {
  const style = usePreferencesStore((s) => s.radioHudStyle);
  const [tab, setTab] = useState<"radio" | "missions">("radio");
  const feedback = useMomentaryFeedback();
  const missionsOpen = showMissions && (!showRadio || tab === "missions");
  if (!showRadio && !showMissions) return null;
  return (
    <section
      {...feedback}
      className="console-display"
      data-expanded="true"
      data-radio-style={style}
      aria-label="Vehicle electronic display"
    >
      {showRadio && <RadioPanel
        compact
        singleRow={style === "no-tabs"}
        transportVisible={style !== "streamlined"}
        onMinimize={onMinimize}
        missionsOpen={missionsOpen}
        onMissionsToggle={showMissions ? () =>
          setTab((current) => (current === "missions" ? "radio" : "missions"))
        : undefined}
      />}
      {!showRadio && <header className="missions-only-heading"><strong>MISSIONS</strong>{onMinimize && <button type="button" aria-label="Minimize missions" onClick={onMinimize}>−</button>}</header>}
      <>
        {showRadio && showMissions && style === "classic" && (
          <nav
            className="console-display-tabs"
            aria-label="Vehicle display tabs"
          >
            <button
              type="button"
              aria-pressed={tab === "radio"}
              onClick={() => setTab("radio")}
            >
              RADIO
            </button>
            <button
              type="button"
              aria-pressed={tab === "missions"}
              onClick={() => setTab("missions")}
            >
              MISSIONS
            </button>
          </nav>
        )}
        {missionsOpen && (
          <div className="console-display-content">
            <MissionApps />
          </div>
        )}
      </>
    </section>
  );
});
