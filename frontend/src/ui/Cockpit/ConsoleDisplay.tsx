import { memo, useState } from "react";
import { useUIStore } from "../../store/menus";
import { MissionApps } from "./MissionApps";
import { RadioPanel } from "./RadioPanel";
import { usePreferencesStore } from "../../store/preferences/preferencesStore";
import { useMomentaryFeedback } from "./useMomentaryFeedback";
/** The driving head unit contains media and mission tools. Settings and research
 * live in their own menu, so idle cabin masks never subscribe this whole panel. */
export const ConsoleDisplay = memo(function ConsoleDisplay({
  onMinimize,
}: {
  onMinimize?: () => void;
}) {
  const style = usePreferencesStore((s) => s.radioHudStyle);
  const [tab, setTab] = useState<"radio" | "missions">("radio");
  const feedback = useMomentaryFeedback();
  return (
    <section
      {...feedback}
      className="console-display"
      data-expanded="true"
      data-radio-style={style}
      aria-label="Vehicle electronic display"
    >
      <RadioPanel compact onMinimize={onMinimize} />
      {
        <>
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
            <button
              type="button"
              onClick={() => useUIStore.getState().openCockpit("navigation")}
            >
              GPS
            </button>
          </nav>
          {tab === "missions" && (
            <div className="console-display-content">
              <MissionApps />
            </div>
          )}
        </>
      }
    </section>
  );
});
