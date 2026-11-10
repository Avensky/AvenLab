import {ColumnStalks} from './ColumnStalks';
import {SteeringSystemPicker} from './panels/SteeringSystemPicker';
import { TurretPage } from "./panels/TurretPage";
import { cockpitParent } from "./panels/tabs";
/** Cockpit shell: shared header/theme, focused pages and confirmed footer.
 * Pages subscribe only while mounted; tabs/navigation and page APIs live in panels/. */
import { useEffect, useRef } from "react";
import { MenuShortcuts } from "../../components/controller";
import { MenuFooter, MenuFrameHeader } from "../../components/menus/MenuFrame";
import { MenuTabButton } from "../../components/menus/MenuTabButton";
import { trapMenuFocus } from "../../components/menus/menuFocus";
import { useAngledMenuHeader } from "../../components/menus/useAngledMenuHeader";
import { useInputStore } from "../../store/input/inputStore";
import {
  cockpitStatus,
  unpackCockpit,
} from "../../store/input/protocol/cockpitMasks";
import { useUIStore } from "../../store/menus/uiStore";
import {
  startVehicleTelemetry,
  useVehicleTelemetryStore,
} from "../../store/telemetry/vehicleTelemetryStore";
import { ThemePreferences } from "../../theme";
import "../../theme/theme.css";
import { Minimap } from "../Minimap/Minimap";
import { CabinClock } from "./CabinClock";
import "./cockpit.css";
import { ConsoleDisplay } from "./ConsoleDisplay";
import { DriveControls } from "./DriveControls";
import "./driverConsole.css";
import { MissionApps } from "./MissionApps";
import { useMomentaryFeedback } from "./useMomentaryFeedback";
import { usePhysicalMenuPress } from "../../controls/physicalMenuPress";
import {
  COCKPIT_TABS,
  useCockpitNavigation,
  LightsPanel,
  WipersPanel,
  CruisePanel,
  ClimatePage,
  BrightnessPage,
  ResearchPanel,
  IgnitionPage,
  RadioPage,
} from "./panels/index";

export function CockpitPanel() {
  const angled = useAngledMenuHeader();
  const contact = useMomentaryFeedback();
  useEffect(startVehicleTelemetry, []);
  const tab = useUIStore((s) => s.cockpitTab),
    requestedMask = useInputStore((s) => s.input.cockpit_mask);
  const confirmedMask = useVehicleTelemetryStore((s) => s.data.cockpitMask);
  const supported = useVehicleTelemetryStore(
    (s) => s.data.signal === "live" && s.data.config.cockpitVersion >= 2,
  );
  const requested = unpackCockpit(requestedMask ?? confirmedMask ?? undefined),
    confirmed = unpackCockpit(confirmedMask ?? undefined),
    status = cockpitStatus(confirmedMask);
  const pending =
    requestedMask !== undefined &&
    (confirmedMask === null || requested.revision !== confirmed.revision);
  const root = useRef<HTMLElement>(null);
  usePhysicalMenuPress(root);
  const close = () => useUIStore.getState().closeOverlay();
  useCockpitNavigation(root, tab);
  const rejection =
    status.rejection === 2
      ? "STOP BEFORE SELECTING PARK OR REVERSE"
      : status.rejection === 3
        ? "CRUISE SET ≥40 KM/H · RESUME ≥32 KM/H"
        : status.rejection
          ? "REQUEST UNAVAILABLE"
          : "";
  const navigation = (
    <nav className={angled ? "cockpit-tabs angled-header-tabs" : "cockpit-tabs"} role="tablist" aria-label="Cockpit systems">
      {COCKPIT_TABS.map((item) => (
        <MenuTabButton
          key={item.id}
          angled={angled}
          data-cockpit-tab={item.id}
          selected={cockpitParent(tab) === item.id}
          onClick={() => useUIStore.getState().setCockpitTab(item.id)}
        >
          {item.label}
        </MenuTabButton>
      ))}
    </nav>
  );
  return (
    <div className="cockpit-overlay menu-surface">
      <section
        className="cockpit-panel"
        ref={root}
        role="dialog"
        aria-modal="true"
        aria-labelledby="cockpit-title"
        onKeyDown={(event) => {
          trapMenuFocus(event);
          if (event.key === "Enter" || event.key === " ")
            event.stopPropagation();
        }}
      >
        <MenuFrameHeader title="COCKPIT" titleId="cockpit-title" eyebrow="" compact={angled}
          className={angled ? "cockpit-header angled-tab-header" : "cockpit-header"}
          actions={<>
            <ThemePreferences />
            <button className="menu-control" type="button" onClick={() => useUIStore.getState().openSettings("accessibility")}>Settings</button>
            <CabinClock />
          </>}>
          {angled && <div className="tabbed-angled-scroll">{navigation}</div>}
        </MenuFrameHeader>
        {!angled && navigation}
        {(tab==='lights'||tab==='wipers'||tab==='cruise')&&<nav className="cockpit-subtabs cockpit-column-tabs" aria-label="Column levers">{([['lights','LIGHTS'],['wipers','WIPERS'],['cruise','CRUISE']] as const).map(([id,label])=><button key={id} aria-pressed={tab===id} onClick={()=>useUIStore.getState().setCockpitTab(id)}>{label}</button>)}</nav>}
        <div {...contact} className="cockpit-content">
          {tab === "drive" && (
            <div className="cockpit-drive-layout">
              <DriveControls />
            </div>
          )}
          {tab === "console" && (
            <div className="cockpit-console-page">
              <ConsoleDisplay />
              <MissionApps />
            </div>
          )}
          {tab === "missions" && <MissionApps />}
          {(tab === "research" || tab === "vehicle") && <ResearchPanel />}
          {(tab === "lights" || tab === "wipers" || tab === "cruise") && (
            <div className="cockpit-column-page">
              <SteeringSystemPicker selected={tab}/>
              <div className="cockpit-column-options"><div className="wheel-assembly cockpit-detail-lever" aria-label={`Large ${tab} lever`}><ColumnStalks system={tab} detailed/></div>

              {tab === "lights" && <LightsPanel />}
              {tab === "wipers" && <WipersPanel />}
              {tab === "cruise" && <CruisePanel />}
              </div>
            </div>
          )}
          {(tab === "climate" || tab === "radio") && <section><nav className="cockpit-subtabs" aria-label="Center console">{([['radio','RADIO'],['climate','CLIMATE']] as const).map(([id,label])=><button key={id} aria-pressed={tab===id} onClick={()=>useUIStore.getState().setCockpitTab(id)}>{label}</button>)}</nav>{tab==='radio'?<RadioPage/>:<ClimatePage/>}</section>}
          {tab === "turret" && <TurretPage />}
          {tab === "brightness" && <BrightnessPage />}

          {tab === "navigation" && <Minimap forceExpanded />}
          {tab === "ignition" && <IgnitionPage />}
        </div>
        <MenuFooter className="cockpit-status cockpit-shortcuts">
          <MenuShortcuts hold backAction={{ onClick: close, label: "Close" }} />
          <span role="status">
            {!supported &&
            ![
              "radio",
              "missions",
              "navigation",
              "console",
              "brightness",
            ].includes(tab)
              ? "UPDATED RUST SERVER REQUIRED"
              : pending
                ? "REQUESTING…"
                : rejection || "REDLINE VECTOR"}
          </span>
        </MenuFooter>
      </section>
    </div>
  );
}
