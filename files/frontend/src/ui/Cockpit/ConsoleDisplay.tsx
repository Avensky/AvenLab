import { memo, useState } from "react";
import { useUIStore } from "../../store/menus";
import { MissionApps } from "./MissionApps";
import { RadioPanel } from "./RadioPanel";
import { useMomentaryFeedback } from "./useMomentaryFeedback";
/** The driving head unit contains media and mission tools. Settings and research
 * live in their own menu, so idle cabin masks never subscribe this whole panel. */
export const ConsoleDisplay = memo(function ConsoleDisplay() {
  const [minimized, setMinimized] = useState(true),
    [tab, setTab] = useState<"radio" | "missions">("radio");
  const feedback = useMomentaryFeedback();
  return (
    <section
      {...feedback}
      className="console-display"
      data-expanded={!minimized}
      aria-label="Vehicle electronic display"
    >
      <RadioPanel
        compact
        minimized={minimized}
        onMinimize={() => setMinimized(!minimized)}
      />
      {!minimized && (
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
      )}
    </section>
  );
});
