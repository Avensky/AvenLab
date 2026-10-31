import { useEffect, type CSSProperties } from "react";
import { usePreferencesStore } from "../store/preferences/preferencesStore";
import { InspectionPanel } from "./InspectionPanel";
import { Minimap } from "./Minimap/Minimap";
import ControlsPanel from "./ControlsPanel";
import Steering from "./Steering";
import Dashboard from "./Dashboard/Dashboard";
import { usePerformanceOverlayStore } from "../performance/performanceOverlayStore";
import { useCanDataStore } from "../store/recon/canDataStore";
import { startVehicleTelemetry } from "../store/telemetry/vehicleTelemetryStore";
import { HudGroup } from "./HudGroup";
import { DrivingIgnition } from "./Cockpit/DrivingIgnition";

export function DrivingHUD() {
  const drivingLayout = usePreferencesStore((s) => s.drivingLayout);
  const touch = usePreferencesStore((s) => s.showTouchControls),
    dock = usePreferencesStore((s) => s.showDriveControls),
    drop = usePreferencesStore((s) => s.wheelDrop);
  const groups = usePreferencesStore((s) => s.hudGroups);
  const needsTelemetry =
    (touch && groups.wheel) ||
    (dock &&
      (groups.ignition ||
        groups.display ||
        groups.climate ||
        groups.shifter ||
        groups.parking ||
        groups.assists));
  useEffect(
    () => (needsTelemetry ? startVehicleTelemetry() : undefined),
    [needsTelemetry],
  );
  const inspector = usePerformanceOverlayStore((s) => s.focused),
    command = useCanDataStore((s) => s.commandOpen);
  return (
    <div
      className="driving-hud"
      data-driving-layout={drivingLayout}
      data-touch-visible={touch}
      data-drive-controls={dock}
      inert={inspector || command}
      onPointerDownCapture={(event) => {
        if (
          (event.target as Element).closest('button,[role="slider"]:not(input)')
        ) {
          event.preventDefault();
          const focused = document.activeElement;
          if (
            focused instanceof HTMLElement &&
            event.currentTarget.contains(focused)
          )
            focused.blur();
        }
      }}
      onMouseDownCapture={(event) => {
        if (
          (event.target as Element).closest('button,[role="slider"]:not(input)')
        )
          event.preventDefault();
      }}
      onPointerDown={(event) => event.stopPropagation()}
      onPointerMove={(event) => event.stopPropagation()}
      onPointerUp={(event) => event.stopPropagation()}
      onPointerCancel={(event) => event.stopPropagation()}
      onKeyUp={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        if (event.key === " " || event.key === "Enter") event.stopPropagation();
      }}
      onClick={(event) => event.stopPropagation()}
    >
      <HudGroup id="gauges" title="INSTRUMENTS" className="instrument-hud">
        <Dashboard />
      </HudGroup>
      {touch && (
        <HudGroup id="wheel" title="STEERING" className="wheel-hud">
          <div
            className="wheel-stage"
            style={{ "--wheel-drop": drop } as CSSProperties}
          >
            <Steering />
          </div>
        </HudGroup>
      )}

      {dock && <DrivingIgnition />}
      <ControlsPanel />
      <Minimap />
      <InspectionPanel />
    </div>
  );
}
