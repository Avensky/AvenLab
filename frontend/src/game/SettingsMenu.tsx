import { useEffect, useState } from "react";
import { TabbedMenu, type MenuRow } from "../components/menus/TabbedMenu";
import { useRenderSettingsStore } from "../store/renderSettingsStore";
import { useDebugViewStore } from "../store/debugViewStore";
import { DEFAULT_BINDINGS, DEFAULT_HUD_GROUPS, HUD_GROUPS, RESERVED_KEYS, usePreferencesStore, type BindingAction } from "../store/preferencesStore";
import { useUIStore } from "../store/uiStore";
import { cityQualityControl, cityViewDistanceControl, cityPerformanceControl, interpolationControl } from "../components/menus/cityQualityControl";

const step = <T,>(values: readonly T[], value: T, dir: 1 | -1 = 1): T => values[(Math.max(0, values.indexOf(value)) + dir + values.length) % values.length];
const keyLabel = (code: string) => code === "Space" ? "Space" : code.replace(/^Key|^Digit/, "");
const BINDING_LABELS: Record<BindingAction, string> = { forward: "Accelerate", reverse: "Reverse", left: "Steer left", right: "Steer right", brake: "Brake", handbrake: "Handbrake" };

export function SettingsMenu() {
  const render = useRenderSettingsStore();
  const debug = useDebugViewStore();
  const prefs = usePreferencesStore();
  const initialTab=useUIStore(s=>s.settingsTab);
  const back = useUIStore((s) => s.backToParentMenu);
  const [pendingBinding, setPendingBinding] = useState<BindingAction | null>(null);
  const [notice, setNotice] = useState("Changes apply immediately");
  useEffect(() => {
    if (!pendingBinding) return;
    const capture = (event: KeyboardEvent) => {
      event.preventDefault(); event.stopImmediatePropagation();
      if (event.repeat) return;
      if (event.code === "Escape") { setPendingBinding(null); setNotice("Binding unchanged"); return; }
      if (!/^(Key[A-Z]|Digit[0-9]|Space)$/.test(event.code) || RESERVED_KEYS.has(event.code)) { setNotice("That key is reserved. Choose a letter, number or Space."); return; }
      const bindings = usePreferencesStore.getState().bindings;
      if (Object.entries(bindings).some(([action, code]) => action !== pendingBinding && code === event.code)) { setNotice("That key is already assigned to another driving action."); return; }
      usePreferencesStore.getState().update({ bindings: { ...bindings, [pendingBinding]: event.code } });
      setPendingBinding(null); setNotice("Keyboard binding saved");
    };
    const cancelFromPad = (event: Event) => { event.stopImmediatePropagation(); if ((event as CustomEvent).detail === "back") setPendingBinding(null); };
    window.addEventListener("keydown", capture, true);
    window.addEventListener("avenlab:panel-action", cancelFromPad, true);
    return () => { window.removeEventListener("keydown", capture, true); window.removeEventListener("avenlab:panel-action", cancelFromPad, true); };
  }, [pendingBinding]);

  const graphics = (
  key: "shadows" | "reflections" | "stars" | "fog" |
       "vehicleLights" | "hud" | "overlay",
  label: string,
  description?: string
): MenuRow => ({
  id: key,
  label,
  description,
  value: render[key] ? "On" : "Off",
  action: () => {
    const store = useRenderSettingsStore.getState();
    store.update({ [key]: !store[key] });
  },
});
  const upcoming = (id: string, label: string, description: string): MenuRow => ({ id, label, description, value: "Planned", disabled: true });
  const groupLabels = {gauges:"Instruments",wheel:"Steering wheel",pedals:"Pedals",ignition:"Ignition key",display:"Vehicle display",climate:"Climate / hazards / clock",shifter:"Shifter",parking:"Parking brake",assists:"Driving assists",chat:"Team / game / general chat",minimap:"Minimap / GPS"};
  const drivingRows: MenuRow[] = [
    { id: "driving-layout", label: "Driving layout", value: prefs.drivingLayout === "controller" ? "Controller" : "Standard", action: () => {
      const controller = prefs.drivingLayout !== "controller";
      prefs.update({ drivingLayout: controller ? "controller" : "standard", showTouchControls: !controller, showDriveControls: !controller });
    } },
    { id: "touch-visible", label: "On-screen steering & pedals", description: "Optional in either layout. Keyboard and controller always work.", value: prefs.showTouchControls ? "Show" : "Hide", action: () => prefs.update({ showTouchControls: !prefs.showTouchControls }) },
    { id: "drive-switches", label: "On-screen drive switches", description: "ABS, TRAC, VSC SPORT and parking brake. All remain available in Cockpit.", value: prefs.showDriveControls ? "Show" : "Hide", action: () => prefs.update({ showDriveControls: !prefs.showDriveControls }) },
  ];
  return <>
    <TabbedMenu initialTab={initialTab} title="Settings" subtitle="Set up your driver station. Graphics, input and accessibility changes apply immediately." onBack={back} status={notice} tabs={[
      { id: "display", label: "Display", description: "Graphics preferences are saved on this device. Higher resolution, reflections and shadows can increase frame time.", rows: [
        { id: "resolution", label: "Resolution scale", value: `${render.dpr}×`, action: (dir) => render.update({ dpr: step([0.5, 0.75, 1, 1.5, 2], render.dpr, dir) }) },
        { id: "fov", label: "Field of view", value: `${prefs.fov}°`, action: (dir) => prefs.update({ fov: step([55, 65, 75, 85, 95, 110], prefs.fov, dir) }) },
        graphics("shadows", "Shadows"), graphics("reflections", "HDR reflections"), graphics("fog", "Distance fog"), graphics("stars", "Animated sky"),
        graphics("vehicleLights", "Vehicle spotlights"), graphics("hud", "Driving HUD"), graphics("overlay", "Performance overlay", "Frame timing, network latency and server diagnostics."),
        ...drivingRows,
        { id: "speed-unit", label: "Speed units", value: prefs.speedUnit === "mph" ? "MPH" : "KM/H", action: () => prefs.update({ speedUnit: prefs.speedUnit === "mph" ? "kmh" : "mph" }) },
        { id: "touch-layout", label: "Touch control style", value: prefs.touchLayout === "sticks" ? "Wheel + throttle stick" : "Wheel + pedals", action: () => prefs.update({ touchLayout: prefs.touchLayout === "sticks" ? "pedals" : "sticks" }) },
        cityQualityControl(render), cityViewDistanceControl(render), interpolationControl(debug), cityPerformanceControl(render),
        { id: "fullscreen", label: "Toggle fullscreen", description: "Requires browser support and a direct click or keyboard press.", action: () => {
          const request = document.fullscreenElement ? document.exitFullscreen?.() : document.documentElement.requestFullscreen?.();
          if (!request) setNotice("Fullscreen is unavailable in this browser");
          else void request.catch(() => setNotice("Use the browser fullscreen command or click this row"));
        } },
      ] },
      { id: "hud", label: "HUD", description: "Hide or restore each group. Closing a group never disables keyboard or controller input. Chat space is reserved; a message service is not connected yet.", rows: [
        ...drivingRows,
        ...HUD_GROUPS.map((id):MenuRow=>({id:`hud-${id}`,label:groupLabels[id],value:prefs.hudGroups[id]?"Show":"Hide",action:()=>prefs.setHudGroup(id,!prefs.hudGroups[id])})),
        {id:"wheel-drop",label:"Wheel below screen",value:`${Math.round(prefs.wheelDrop*100)}%`,action:dir=>prefs.update({wheelDrop:step([0,.15,.28,.4,.55],prefs.wheelDrop,dir)})},
        {id:"wheel-travel",label:"Steering thumb travel",description:"Allows the thumb to move beyond the wheel rim. Horizontal travel still sets steering.",value:`${Math.round(prefs.steeringTravel*100)}%`,action:dir=>prefs.update({steeringTravel:step([.9,1,1.12,1.25,1.3],prefs.steeringTravel,dir)})},
        {id:"restore-hud",label:"Restore all HUD groups",action:()=>{prefs.update({hudGroups:{...DEFAULT_HUD_GROUPS},showTouchControls:true,showDriveControls:true});render.update({hud:true});setNotice("All HUD groups restored");}},
      ] },
      { id: "drivetrain", label: "Drivetrain", description: "Choose the shifter layout. Forward driving stays automatic; gear taps briefly override it. Neutral and reverse remain explicit selections. No clutch is required.", rows: [
        {id:"shift-layout",label:"Shifter layout",value:prefs.shiftLayout==="automatic"?"Automatic P/R/N/D":"H-pattern R/1–6",action:()=>prefs.update({shiftLayout:prefs.shiftLayout==="automatic"?"h-pattern":"automatic"})},
      ] },
      { id: "audio", label: "Audio", description: "The vehicle audio components in this build are inactive. Mixer controls will become available with engine, world and voice playback.", rows: [
        upcoming("master", "Master volume", "Volume for all playback."), upcoming("engine", "Vehicle & engine volume", "Engine, tires, horn and impacts."),
        upcoming("music", "Music volume", "Menu and match music."), upcoming("voice", "Voice chat", "Team communications and microphone controls."),
      ] },
      { id: "keyboard", label: "Keyboard", description: "Select a driving action, then press a key. Fixed shortcuts remain reserved. Menu navigation always uses arrows / WASD, Enter and Escape.", rows: [
        ...(Object.keys(DEFAULT_BINDINGS) as BindingAction[]).map((action): MenuRow => ({ id: action, label: BINDING_LABELS[action], value: keyLabel(prefs.bindings[action]), adjustable: false, action: () => { setNotice(`Choose a key for ${BINDING_LABELS[action]}`); setPendingBinding(action); } })),
        { id: "look", label: "Mouse look sensitivity", description: "Hold the right mouse button and drag to look around.", value: `${prefs.cameraSensitivity}×`, action: (dir) => prefs.update({ cameraSensitivity: step([0.25, 0.5, 0.75, 1, 1.5, 2], prefs.cameraSensitivity, dir) }) },
        { id: "restore", label: "Restore default controls", action: () => { prefs.resetControls(); setNotice("Default keyboard and controller controls restored"); } },
      ], content: <p className="mt-1 text-xs leading-tight text-slate-400">F2 Debugger · F3 Latency overlay · F8 Start/stop capture · H Change vehicle · Shift+H Hazards · E Engine · L Lights · Z/X Indicators · Q ABS · T TCS · Shift Boost request · N Horn · R Reset · ` Terminal</p> },
      { id: "controller", label: "Controller", description: "Standard gamepad layout: RT accelerate · LT brake · Left stick steer · B handbrake · Start pause. In menus: A select, B back, LB/RB tabs. Release driving controls after closing a menu before driving again.", rows: [
        ...drivingRows,
        { id: "deadzone", label: "Stick deadzone", value: `${Math.round(prefs.controllerDeadzone * 100)}%`, action: (dir) => prefs.update({ controllerDeadzone: step([0.05, 0.12, 0.2, 0.3, 0.4], prefs.controllerDeadzone, dir) }) },
        { id: "steering", label: "Steering sensitivity", value: `${prefs.steeringSensitivity}×`, action: (dir) => prefs.update({ steeringSensitivity: step([0.5, 0.75, 1, 1.25, 1.5], prefs.steeringSensitivity, dir) }) },
        { id: "invert", label: "Invert steering", value: prefs.invertSteering ? "On" : "Off", action: () => prefs.update({ invertSteering: !prefs.invertSteering }) },
        upcoming("vibration", "Controller vibration", "Available after force-feedback events are connected."),
      ] },
      { id: "social", label: "Social", description: "Party, team chat and matchmaking are planned for capture the flag. No communication or privacy service is connected yet.", rows: [
        upcoming("party", "Party & invites", "Form a squad and coordinate roles."), upcoming("teamchat", "Team / server chat", "Choose communication channels."),
        upcoming("privacy", "Privacy & blocked players", "Manage invites, visibility and blocking."),
      ] },
      { id: "other", label: "Other", description: "Sandbox is available now. Competitive matches, loot and currency will be added with their supporting game systems.", rows: [
        { id: "clear-visuals", label: "Clear per-object visual overrides", description: "Restore each vehicle and city chunk to its default display mode.", action: () => { render.update({ vehicleOverrides: {}, chunkOverrides: {}, assetGlbs: {} }); setNotice("Visual overrides cleared"); } },
        upcoming("match", "Matchmaking & region", "Queue, ready status and server selection."), upcoming("resources", "Resource alerts", "Fuel, heat and resupply warnings will use authoritative vehicle data."),
      ] },
      { id: "accessibility", label: "Accessibility", description: "Menus use text labels as well as color. These preferences are saved on this device.", rows: [
        { id: "contrast", label: "High contrast menus", value: prefs.highContrast ? "On" : "Off", action: () => prefs.update({ highContrast: !prefs.highContrast }) },
        { id: "motion", label: "Reduce motion", description: "Stops garage camera rotation and menu transitions.", value: prefs.reducedMotion ? "On" : "Off", action: () => prefs.update({ reducedMotion: !prefs.reducedMotion }) },
        { id: "text", label: "Menu text size", value: `${Math.round(prefs.menuTextScale * 100)}%`, action: (dir) => prefs.update({ menuTextScale: step([1, 1.1, 1.25], prefs.menuTextScale, dir) }) },
        upcoming("subtitles", "Subtitles", "Available when voiced content is added."),
      ] },
    ]} />
    {pendingBinding && <div className="menu-surface menu-bind-dialog fixed inset-0 z-[60] flex items-center justify-center bg-black/85" role="dialog" aria-modal="true" aria-label="Choose keyboard binding">
      <div className="menu-bind-card"><h2>Press a key for {BINDING_LABELS[pendingBinding]}</h2><p role="status">{notice}</p><button autoFocus type="button" className="menu-control menu-action" onClick={() => setPendingBinding(null)}>Cancel · Esc / B</button></div>
    </div>}
  </>;
}
