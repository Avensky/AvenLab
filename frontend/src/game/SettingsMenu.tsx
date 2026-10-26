import { useEffect, useState } from "react";
import { TabbedMenu, type MenuRow } from "../components/menus/TabbedMenu";
import { useRenderSettingsStore } from "../store/renderSettingsStore";
import { DEFAULT_BINDINGS, RESERVED_KEYS, usePreferencesStore, type BindingAction } from "../store/preferencesStore";
import { useUIStore } from "../store/uiStore";

const step = <T,>(values: readonly T[], value: T, dir: 1 | -1 = 1): T => values[(Math.max(0, values.indexOf(value)) + dir + values.length) % values.length];
const keyLabel = (code: string) => code === "Space" ? "Space" : code.replace(/^Key|^Digit/, "");
const BINDING_LABELS: Record<BindingAction, string> = { forward: "Accelerate", reverse: "Reverse", left: "Steer left", right: "Steer right", brake: "Brake", handbrake: "Handbrake" };

export function SettingsMenu() {
  const render = useRenderSettingsStore();
  const prefs = usePreferencesStore();
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
  const graphics = (key: "shadows" | "reflections" | "stars" | "fog" | "vehicleLights" | "hud" | "overlay", label: string, description?: string): MenuRow => ({
    id: key, label, description, value: render[key] ? "On" : "Off", action: () => render.update({ [key]: !render[key] }),
  });
  const upcoming = (id: string, label: string, description: string): MenuRow => ({ id, label, description, value: "Planned", disabled: true });
  return <>
    <TabbedMenu title="Settings" subtitle="Set up your driver station. Graphics, input and accessibility changes apply immediately." onBack={back} status={notice} tabs={[
      { id: "display", label: "Display", description: "Graphics preferences are saved on this device. Higher resolution, reflections and shadows can increase frame time.", rows: [
        { id: "resolution", label: "Resolution scale", value: `${render.dpr}×`, action: (dir) => render.update({ dpr: step([0.5, 0.75, 1, 1.5, 2], render.dpr, dir) }) },
        { id: "fov", label: "Field of view", value: `${prefs.fov}°`, action: (dir) => prefs.update({ fov: step([55, 65, 75, 85, 95, 110], prefs.fov, dir) }) },
        graphics("shadows", "Shadows"), graphics("reflections", "HDR reflections"), graphics("fog", "Distance fog"), graphics("stars", "Animated sky"),
        graphics("vehicleLights", "Vehicle spotlights"), graphics("hud", "Driving HUD & touch controls"), graphics("overlay", "Performance overlay", "Frame timing, network latency and server diagnostics."),
        { id: "fullscreen", label: "Toggle fullscreen", description: "Requires browser support and a direct click or keyboard press.", action: () => {
          const request = document.fullscreenElement ? document.exitFullscreen?.() : document.documentElement.requestFullscreen?.();
          if (!request) setNotice("Fullscreen is unavailable in this browser");
          else void request.catch(() => setNotice("Use the browser fullscreen command or click this row"));
        } },
      ] },
      { id: "audio", label: "Audio", description: "The vehicle audio components in this build are inactive. Mixer controls will become available with engine, world and voice playback.", rows: [
        upcoming("master", "Master volume", "Volume for all playback."), upcoming("engine", "Vehicle & engine volume", "Engine, tires, horn and impacts."),
        upcoming("music", "Music volume", "Menu and match music."), upcoming("voice", "Voice chat", "Team communications and microphone controls."),
      ] },
      { id: "keyboard", label: "Keyboard", description: "Select a driving action, then press a key. Fixed shortcuts remain reserved. Menu navigation always uses arrows / WASD, Enter and Escape.", rows: [
        ...(Object.keys(DEFAULT_BINDINGS) as BindingAction[]).map((action): MenuRow => ({ id: action, label: BINDING_LABELS[action], value: keyLabel(prefs.bindings[action]), adjustable: false, action: () => { setNotice(`Choose a key for ${BINDING_LABELS[action]}`); setPendingBinding(action); } })),
        { id: "look", label: "Mouse look sensitivity", description: "Hold the right mouse button and drag to look around.", value: `${prefs.cameraSensitivity}×`, action: (dir) => prefs.update({ cameraSensitivity: step([0.25, 0.5, 0.75, 1, 1.5, 2], prefs.cameraSensitivity, dir) }) },
        { id: "restore", label: "Restore default controls", action: () => { prefs.resetControls(); setNotice("Default keyboard and controller controls restored"); } },
      ], content: <p className="mt-1 text-xs leading-tight text-slate-400">F2 Debugger · F3 Latency overlay · F8 Record/cancel · H Change vehicle · Shift+H Hazards · E Engine · L Lights · Z/X Indicators · Q ABS · T TCS · Shift Boost · N Horn · R Reset · ` Terminal</p> },
      { id: "controller", label: "Controller", description: "Standard gamepad layout: RT accelerate · LT brake · Left stick steer · B handbrake · Start pause. In menus: A select, B back, LB/RB tabs. Release driving controls after closing a menu before driving again.", rows: [
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
