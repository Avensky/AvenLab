import {BridgeControls} from '../world/props/BridgeLever';
import { useMotionView } from "../store/session/networkViews";
import { DrivingIgnition } from './Cockpit/DrivingIgnition';
import { FuturisticHUD } from "./FuturisticHUD/FuturisticHUD";
import { TeammateHUD } from "./FuturisticHUD/TeammateHUD";
import { CenterCombatDock } from "./FuturisticHUD/CenterCombatDock";
import {CombatNotices} from "../combat/CombatNotices";
import {VehicleHealthHUD} from '../combat/VehicleHealthHUD';
import {ActiveEffectsBar} from '../combat/ActiveEffectsBar';
import {useCombatStore} from '../combat/combatStore';
import {EditorDriveBar} from '../worldBuilder/vehicleEditor/EditorDriveBar';
import { WeaponSelector } from '../combat/WeaponSelector';
import { ChatDock } from "./ChatDock";
import { useEffect, type CSSProperties } from "react";
import { usePreferencesStore } from "../store/preferences/preferencesStore";
import { InspectionPanel } from "./InspectionPanel";
import ControlsPanel from "./ControlsPanel";
import Steering from "./Steering";
import Dashboard from "./Dashboard/Dashboard";
import { usePerformanceOverlayStore } from "../performance/performanceOverlayStore";
import { useCanDataStore } from "../store/recon/canDataStore";
import { startVehicleTelemetry } from "../store/telemetry/vehicleTelemetryStore";
import { HudGroup } from "./HudGroup";

import { useRenderSettingsStore } from "../store/presentation/renderSettingsStore";

export function DrivingHUD() {
  const ctf = useMotionView((s) => Boolean(s.snapshot?.match_state));
  const scoped=useCombatStore(s=>s.scope&&s.enabled);
  const drivingLayout = usePreferencesStore((s) => s.drivingLayout);
  const touch = usePreferencesStore((s) => s.showTouchControls),
    dock = usePreferencesStore((s) => s.showDriveControls),
    drop = usePreferencesStore((s) => s.wheelDrop);
  const groups = usePreferencesStore((s) => s.hudGroups);
  const lowDetail = useRenderSettingsStore(s => s.lowDetail);
  const needsTelemetry =
    groups.wheel || groups.stalks ||
      (groups.ignition ||
        groups.display || groups.missions ||
        groups.climate ||
        groups.shifter ||
        groups.parking ||
        groups.assists);
  useEffect(
    () => (needsTelemetry ? startVehicleTelemetry() : undefined),
    [needsTelemetry],
  );
  const inspector = usePerformanceOverlayStore((s) => s.focused),
    command = useCanDataStore((s) => s.commandOpen);
  return (
    <div
      className="driving-hud"
      style={{"--wheel-drop":drop} as CSSProperties}
      data-scoped={scoped}
      data-driving-layout={drivingLayout}
      data-touch-visible={touch}
      data-drive-controls={dock}
      data-ctf-match={ctf}
      data-futuristic={groups.futuristic}
      data-low-detail={lowDetail}
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
      <div className="hud-top-left">
      <HudGroup id="gauges" title="INSTRUMENTS" className="instrument-hud">
        <Dashboard />
      </HudGroup>
      {groups.teammates && <TeammateHUD />}
      </div>
      {(groups.wheel || groups.stalks) && (
        <section className="hud-group wheel-hud" data-hud-group={groups.wheel ? "wheel" : "stalks"} aria-label={groups.wheel ? "STEERING group" : "WHEEL LEVERS group"}>
          <div
            className="wheel-stage"
            style={{ "--wheel-drop": drop } as CSSProperties}
          >
            <Steering />
          </div>
        </section>
      )}

      {groups.futuristic && groups.ignition && <div className="wheel-ignition-station"><DrivingIgnition/></div>}
      <EditorDriveBar />
      <CenterCombatDock>
        <ActiveEffectsBar />
        <WeaponSelector />
        {groups.futuristic && <FuturisticHUD />}
      </CenterCombatDock>
      <BridgeControls />
      <CombatNotices />
      <VehicleHealthHUD />
      <ControlsPanel />
      <InspectionPanel />
      {groups.chat && <ChatDock />}
    </div>
  );
}
