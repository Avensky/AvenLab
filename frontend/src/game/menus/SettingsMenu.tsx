import {useTireEffectsSettings} from '../../vehicles/effects/tireEffectsSettings';
import {HEALTH_BAR_LABELS,cycleHealthBarMode} from "../../store/preferences/healthVisibility";
import {NOTICE_CHANNELS,NOTICE_LABELS,DEFAULT_NOTICE_CHANNELS} from '../../combat/noticeModel';
import { HUD_GROUP_LABELS } from "../../store/preferences/index";
import { CLIMATE_HUD_LABELS, CLIMATE_HUD_SIZES } from "../../store/preferences/hudVisibility";
import { ControllerGuide } from "../../components/controller";
import { appearanceSettingsRows } from "./appearanceSettingsRows";
import { useEffect, useState } from "react";
import { TabbedMenu, type MenuRow } from "../../components/menus/TabbedMenu";
import { useRenderSettingsStore } from "../../store/presentation/renderSettingsStore";
import { useDebugViewStore } from "../../store/presentation/debugViewStore";
import {
  DEFAULT_BINDINGS,
  DEFAULT_HUD_GROUPS,
  HUD_GROUPS,
  isBindingKey,
  usePreferencesStore,
  type BindingAction,
} from "../../store/preferences/preferencesStore";
import { useUIStore } from "../../store/menus/uiStore";
import {
  useTextKeyboardStore,
  type KeyboardAssist,
} from "../../store/text/keyboardStore";
import {
  cityQualityControl,
  cityViewDistanceControl,
  cityPerformanceControl,
  interpolationControl,
} from "../../components/menus/cityQualityControl";
import { garageSettingsRows } from "./garageSettingsRows";
import {useVehicleAudioSettings} from '../../audio/vehicleAudioSettings';
import type {VehicleAudioSettings} from '../../audio/audioSettings';

const step = <T,>(values: readonly T[], value: T, dir: 1 | -1 = 1): T =>
  values[
    (Math.max(0, values.indexOf(value)) + dir + values.length) % values.length
  ];
const keyLabel = (code: string) =>
  code === "Space" ? "Space" : code.replace(/^Key|^Digit/, "");
const BINDING_LABELS: Record<BindingAction, string> = {
  forward: "Accelerate",
  reverse: "Reverse",
  left: "Steer left",
  right: "Steer right",
  brake: "Brake",
  handbrake: "Handbrake",
  fire:"Fire primary weapon (hold)",
  secondaryFire:"Fire secondary weapon (hold)",
  nextWeapon:"Next secondary weapon",
  previousWeapon:"Previous secondary weapon",
  scope: "Turret scope",
  revive: "Mechanic revive nearby teammate",
  barrier: "Tank barrier / CX-30 dive shield",
  healthBars: "Cycle health bars",
  headlights: "Headlights",
  ultimate: "Vehicle ultimate",
};

export function SettingsMenu() {
  const keyboardAssist = useTextKeyboardStore((s) => s.mode);
  const render = useRenderSettingsStore();
  const debug = useDebugViewStore();
  const prefs = usePreferencesStore();
  const tireEffects=useTireEffectsSettings();
  const audio = useVehicleAudioSettings();
  const initialTab = useUIStore((s) => s.settingsTab);
  const back = useUIStore((s) => s.backToParentMenu);
  const [pendingBinding, setPendingBinding] = useState<BindingAction | null>(
    null,
  );
  const [notice, setNotice] = useState("");
  const audioVolume=(key:keyof Pick<VehicleAudioSettings,'master'|'engines'|'tires'|'tracks'|'turbo'|'nitrous'|'echo'>,label:string):MenuRow=>({
    id:'audio-'+key,label,value:`${Math.round(audio[key]*100)}%`,adjustable:true,
    action:direction=>audio.update({[key]:Math.round((audio[key]+direction*.05)*100)/100}),
  });
  useEffect(() => {
    if (!pendingBinding) return;
    const capture = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (event.repeat) return;
      if (event.code === "Escape") {
        setPendingBinding(null);
        setNotice("Binding unchanged");
        return;
      }
      if (
        !isBindingKey(pendingBinding,event.code)
      ) {
        setNotice("That key is reserved. Choose a letter, number or Space.");
        return;
      }
      const bindings = usePreferencesStore.getState().bindings;
      if (
        Object.entries(bindings).some(
          ([action, code]) => action !== pendingBinding && code === event.code,
        )
      ) {
        setNotice("That key is already assigned to another driving action.");
        return;
      }
      usePreferencesStore
        .getState()
        .update({ bindings: { ...bindings, [pendingBinding]: event.code } });
      setPendingBinding(null);
      setNotice("Keyboard binding saved");
    };
    const cancelFromPad = (event: Event) => {
      event.stopImmediatePropagation();
      if ((event as CustomEvent).detail === "back") setPendingBinding(null);
    };
    window.addEventListener("keydown", capture, true);
    window.addEventListener("avenlab:panel-action", cancelFromPad, true);
    return () => {
      window.removeEventListener("keydown", capture, true);
      window.removeEventListener("avenlab:panel-action", cancelFromPad, true);
    };
  }, [pendingBinding]);

  const graphics = (
    key:
      | "shadows"
      | "reflections"
      | "vehicleLights"
      | "hud"
      | "overlay",
    label: string,
    description?: string,
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
  const upcoming = (
    id: string,
    label: string,
    description: string,
  ): MenuRow => ({ id, label, description, value: "Planned", disabled: true });
  const groupLabels = HUD_GROUP_LABELS;
  const turretRows:MenuRow[] = ([['turretYawSensitivity','Turret turning sensitivity'],['turretPitchSensitivity','Turret elevation sensitivity']] as const).map(([id,label])=>({
    id,label,description:'Shared by the on-screen aiming stick and controller right stick.',value:`${prefs[id]}×`,
    action:dir=>prefs.update({[id]:step([0.25,0.5,0.75,1,1.25,1.5,2,2.5,3],prefs[id],dir)}),
  }));
  const drivingRows: MenuRow[] = [
    {
      id: "driving-layout",
      label: "Driving layout",
      value: prefs.drivingLayout === "controller" ? "Controller" : "Standard",
      action: () => {
        const controller = prefs.drivingLayout !== "controller";
        prefs.update({
          drivingLayout: controller ? "controller" : "standard",
          showTouchControls: !controller,
          showDriveControls: !controller,
        });
      },
    },
    {
      id: "touch-visible",
      label: "On-screen touch controls",
      description:
        "Show or hide wheel, levers, pedals and aim controls together. Individual HUD switches below can restore any combination. Keyboard and controller always work.",
      value: prefs.showTouchControls ? "Show" : "Hide",
      action: () =>
        prefs.update({ showTouchControls: !prefs.showTouchControls }),
    },
    {
      id: "drive-switches",
      label: "On-screen console controls",
      description:
        "Show or hide console widgets together, then mix individual components below. Cockpit controls remain available.",
      value: prefs.showDriveControls ? "Show" : "Hide",
      action: () =>
        prefs.update({ showDriveControls: !prefs.showDriveControls }),
    },
  ];
  return (
    <>
      <TabbedMenu
        initialTab={initialTab}
        title="Settings"
        onBack={back}
        status={notice}
        tabs={[
          {
            id: "display",
            label: "Display",
            description:
              "Graphics preferences are saved on this device. Higher resolution, reflections and shadows can increase frame time.",
            rows: [
              cityPerformanceControl(render),
              {
                id: "resolution",
                label: "Resolution scale",
                value: `${render.dpr}×`,
                action: (dir) =>
                  render.update({
                    dpr: step([0.5, 0.75, 1, 1.5, 2], render.dpr, dir),
                  }),
              },
              {
                id: "fov",
                label: "Field of view",
                value: `${prefs.fov}°`,
                action: (dir) =>
                  prefs.update({
                    fov: step([55, 65, 75, 85, 95, 110], prefs.fov, dir),
                  }),
              },
              graphics("shadows", "Shadows"),
              graphics("reflections", "High-detail sky reflections", "Sharpens reflections on paint and glass. The room controls sky brightness and fog."),
              graphics("vehicleLights", "Vehicle spotlights"),
              graphics(
                "overlay",
                "Performance overlay",
                "Frame timing, network latency and server diagnostics.",
              ),
              {
                id: "speed-unit",
                label: "Speed units",
                value: prefs.speedUnit === "mph" ? "MPH" : "KM/H",
                action: () =>
                  prefs.update({
                    speedUnit: prefs.speedUnit === "mph" ? "kmh" : "mph",
                  }),
              },
              {
                id: "touch-layout",
                label: "Touch control style",
                value:
                  prefs.touchLayout === "sticks"
                    ? "Wheel + throttle stick"
                    : "Wheel + pedals",
                action: () =>
                  prefs.update({
                    touchLayout:
                      prefs.touchLayout === "sticks" ? "pedals" : "sticks",
                  }),
              },
              cityQualityControl(render),
              cityViewDistanceControl(render),
              interpolationControl(debug),
              {
                id: "fullscreen",
                label: "Toggle fullscreen",
                description:
                  "Requires browser support and a direct click or keyboard press.",
                action: () => {
                  const request = document.fullscreenElement
                    ? document.exitFullscreen?.()
                    : document.documentElement.requestFullscreen?.();
                  if (!request)
                    setNotice("Fullscreen is unavailable in this browser");
                  else
                    void request.catch(() =>
                      setNotice(
                        "Use the browser fullscreen command or click this row",
                      ),
                    );
                },
              },
            ],
          },
          {
            id: "hud",
            label: "HUD",
            description:
              "Mix any HUD components individually. Presets are shortcuts; each switch below controls its own component. Keyboard and controller inputs remain available.",
            rows: [
              graphics("hud", "Driving HUD"),
              ...drivingRows,
              {
                id: "instrument-preset",
                label: "Instrument layout",
                value: prefs.hudGroups.gauges ? (prefs.hudGroups.futuristic ? "BOTH" : "CLASSIC") : (prefs.hudGroups.futuristic ? "FUTURISTIC" : "HIDDEN"),
                description: "Choose a starting layout, then mix individual HUD groups below. Driving inputs stay enabled.",
                action: (dir) => {
                  const current = prefs.hudGroups.gauges ? (prefs.hudGroups.futuristic ? "both" : "classic") : (prefs.hudGroups.futuristic ? "futuristic" : "hidden");
                  const next = step(["classic", "futuristic", "both", "hidden"] as const, current, dir);
                  prefs.update({hudGroups: {gauges: next === "classic" || next === "both", futuristic: next === "futuristic" || next === "both"}});
                },
              },
              {
                id: "health-bars",
                label: "Health bars",
                value: HEALTH_BAR_LABELS[prefs.healthBars],
                description: `Cycle with ${keyLabel(prefs.bindings.healthBars)}. Team filters include your own team. Defeat and damage feedback remain visible. Rebind in Keyboard.`,
                action: (dir) => prefs.update({healthBars:cycleHealthBarMode(prefs.healthBars,dir)}),
              },
              ...NOTICE_CHANNELS.map((channel):MenuRow=>({
                id:`notice-${channel}`,label:NOTICE_LABELS[channel],
                description:'Compact, color-coded game notices are separate from chat.',
                value:prefs.notificationChannels[channel]?'Show':'Hide',
                action:()=>prefs.update({notificationChannels:{...prefs.notificationChannels,
                  [channel]:!prefs.notificationChannels[channel]}}),
              })),
              {
                id: "climate-size",
                label: "Climate dashboard style",
                value: CLIMATE_HUD_LABELS[prefs.climateHudSize],
                description: "Single bar omits performance; Compact adds the readout. Performance and hazards can also be shown independently below.",
                action: (dir) => {
                  const size = step(CLIMATE_HUD_SIZES, prefs.climateHudSize, dir);
                  prefs.update({climateHudSize: size, ...(size === "single" ? {hudGroups: {performance: false}} : size === "compact" ? {hudGroups: {performance: true, hazards: true}} : {})});
                },
              },
              ...HUD_GROUPS.map(
                (id): MenuRow => ({
                  id: `hud-${id}`,
                  label: groupLabels[id],
                  value: prefs.hudGroups[id] ? "Show" : "Hide",
                  action: () => prefs.setHudGroup(id, !prefs.hudGroups[id]),
                }),
              ),
              {
                id: "minimap-size",
                label: "Minimap size",
                description:
                  "Resize the corner map. The full Cockpit GPS is unchanged.",
                value: `${Math.round(prefs.minimapScale * 100)}%`,
                action: (dir) =>
                  prefs.update({
                    minimapScale: step(
                      [0.5, 0.75, 1, 1.25],
                      prefs.minimapScale,
                      dir,
                    ),
                  }),
              },
              {
                id: "wheel-drop",
                label: "Wheel below screen",
                value: `${Math.round(prefs.wheelDrop * 100)}%`,
                action: (dir) =>
                  prefs.update({
                    wheelDrop: step(
                      [0, 0.15, 0.28, 0.4, 0.55],
                      prefs.wheelDrop,
                      dir,
                    ),
                  }),
              },
              {
                id: "wheel-travel",
                label: "Steering thumb travel",
                description:
                  "Allows the thumb to move beyond the wheel rim. Horizontal travel still sets steering.",
                value: `${Math.round(prefs.steeringTravel * 100)}%`,
                action: (dir) =>
                  prefs.update({
                    steeringTravel: step(
                      [0.9, 1, 1.12, 1.25, 1.3],
                      prefs.steeringTravel,
                      dir,
                    ),
                  }),
              },
              {
                id: "restore-hud",
                label: "Restore all HUD groups",
                action: () => {
                  prefs.update({
                    hudGroups: { ...DEFAULT_HUD_GROUPS },
                    healthBars: "all",
                    notificationChannels:{...DEFAULT_NOTICE_CHANNELS},
                    ignitionVisibility: "always",
                    showTouchControls: true,
                    showDriveControls: true,
                  });
                  render.update({ hud: true });
                  setNotice("All HUD groups restored");
                },
              },
            ],
          },
          {
            id: "drivetrain",
            label: "Drivetrain",
            description:
              "Choose the shifter layout. Forward driving stays automatic; gear taps briefly override it. Neutral and reverse remain explicit selections. No clutch is required.",
            rows: [
              {
                id: "shift-layout",
                label: "Shifter layout",
                value:
                  prefs.shiftLayout === "automatic"
                    ? "Automatic P/R/N/D"
                    : "H-pattern R/1–6",
                action: () =>
                  prefs.update({
                    shiftLayout:
                      prefs.shiftLayout === "automatic"
                        ? "h-pattern"
                        : "automatic",
                  }),
              },
            ],
          },
          {
            id: "audio",
            label: "Audio",
            description:
              "Procedural vehicle audio includes tire squeal, engines, tracks, turbo and nitrous. Nearby sounds use distance and stereo position; tunnel echo uses authored volumes. Radio keeps its own mixer.",
            rows: [
              {id:'tire-volume',label:'Tire squeal volume',value:`${Math.round(tireEffects.volume*100)}%`,adjustable:true,action:direction=>tireEffects.setVolume(Math.round((tireEffects.volume+direction*.05)*100)/100)},
              {id:'tire-marks',label:'Skid marks',value:tireEffects.marks?'On':'Off',action:()=>tireEffects.setMarks(!tireEffects.marks)},
              {id:'vehicle-audio',label:'Vehicle sounds',value:audio.enabled?'On':'Off',action:()=>audio.update({enabled:!audio.enabled})},
              audioVolume('master','Vehicle sound master'),
              audioVolume('engines','Engine and intake'),
              audioVolume('tires','Tires and road noise'),
              audioVolume('tracks','Tank tracks and hull wash'),
              audioVolume('turbo','Turbo spool and blow-off'),
              audioVolume('nitrous','Nitrous flow'),
              audioVolume('echo','Tunnel echo'),
              {id:'spatial-audio',label:'Directional audio',value:audio.spatial?'Stereo position':'Centered with distance',action:()=>audio.update({spatial:!audio.spatial})},
              {id:'audio-voices',label:'Nearby vehicle sound budget',value:String(audio.maxVoices),adjustable:true,
                action:direction=>audio.update({maxVoices:step([2,4,6] as const,audio.maxVoices,direction)}),
              },
              upcoming("music", "Music", "Choose local tracks and volume from the cockpit radio."),
              upcoming(
                "voice",
                "Voice chat",
                "Team communications and microphone controls.",
              ),
            ],
          },
          {
            id: "keyboard",
            label: "Keyboard",
            description:
              "Select a driving or combat action, then press a key. Hold the primary or secondary fire binding to shoot while driving. Fixed shortcuts remain reserved. Menu navigation always uses arrows / WASD, Enter and Escape.",
            rows: [

              ...(Object.keys(DEFAULT_BINDINGS) as BindingAction[]).map(
                (action): MenuRow => ({
                  id: action,
                  label: BINDING_LABELS[action],
                  value: keyLabel(prefs.bindings[action]),
                  adjustable: false,
                  action: () => {
                    setNotice(`Choose a key for ${BINDING_LABELS[action]}`);
                    setPendingBinding(action);
                  },
                }),
              ),
              {
                id: "look",
                label: "Mouse look sensitivity",
                description:
                  "Hold the right mouse button and drag to look around.",
                value: `${prefs.cameraSensitivity}×`,
                action: (dir) =>
                  prefs.update({
                    cameraSensitivity: step(
                      [0.25, 0.5, 0.75, 1, 1.5, 2],
                      prefs.cameraSensitivity,
                      dir,
                    ),
                  }),
              },
              {
                id: "restore",
                label: "Restore default controls",
                action: () => {
                  prefs.resetControls();
                  setNotice(
                    "Default keyboard and controller controls restored",
                  );
                },
              },
            ],
            content: (
              <p className="mt-1 text-xs leading-tight text-slate-400">
                Tab Hold scoreboard · F1 Hero abilities · F2 Debugger · F3 Latency overlay · F8 Start/stop capture · H
                Change vehicle · Shift+H Hazards · E Engine · L Lights · Z/X
                Indicators · Q ABS · T TCS · Shift Tank Ram / car boost · weapon keys listed above · N Horn · R
                Reset · ` Terminal
              </p>
            ),
          },
          {
            id: "controller",
            label: "Controller",
            description:
              "Standard gamepad layout: RT accelerate · LT brake · Left stick steer · B handbrake · Start pause. Armed tank: Right stick aim · RB fire · LB charge · Y weapon cycle · R3 angle lock. In menus: A select, B back, LB/RB tabs. Release driving controls after closing a menu before driving again.",
            rows: [
              ...turretRows,
              {
                id: "deadzone",
                label: "Stick deadzone",
                value: `${Math.round(prefs.controllerDeadzone * 100)}%`,
                action: (dir) =>
                  prefs.update({
                    controllerDeadzone: step(
                      [0.05, 0.12, 0.2, 0.3, 0.4],
                      prefs.controllerDeadzone,
                      dir,
                    ),
                  }),
              },
              {
                id: "steering",
                label: "Steering sensitivity",
                value: `${prefs.steeringSensitivity}×`,
                action: (dir) =>
                  prefs.update({
                    steeringSensitivity: step(
                      [0.5, 0.75, 1, 1.25, 1.5],
                      prefs.steeringSensitivity,
                      dir,
                    ),
                  }),
              },
              {
                id: "invert",
                label: "Invert steering",
                value: prefs.invertSteering ? "On" : "Off",
                action: () =>
                  prefs.update({ invertSteering: !prefs.invertSteering }),
              },
              upcoming(
                "vibration",
                "Controller vibration",
                "Available after force-feedback events are connected.",
              ),
            ],
            content: <ControllerGuide />,
          },
          {
            id: "social",
            label: "Social",
            description:
              "Manage teammates, social groups, private worlds and invitations. Team chat and matchmaking are planned.",
            rows: [
              {
                id: "social-hub",
                label: "Worlds, teammates & groups",
                description: "Create private worlds and manage invitations.",
                action: () => {
                  const ui = useUIStore.getState();
                  if (ui.screen === "sandbox") ui.setOverlay("social");
                  else ui.setScreen("social");
                },
              },
              upcoming(
                "teamchat",
                "Team / server chat",
                "Choose communication channels.",
              ),
              upcoming(
                "privacy",
                "Privacy & blocked players",
                "Manage invites, visibility and blocking.",
              ),
            ],
          },
          {
            id: "other",
            label: "Other",
            description:
              "Sandbox is available now. Competitive matches, loot and currency will be added with their supporting game systems.",
            rows: [
              {
                id: "clear-visuals",
                label: "Clear per-object visual overrides",
                description:
                  "Restore each vehicle and city chunk to its default display mode.",
                action: () => {
                  render.update({
                    vehicleOverrides: {},
                    chunkOverrides: {},
                    assetGlbs: {},
                  });
                  setNotice("Visual overrides cleared");
                },
              },
              upcoming(
                "match",
                "Matchmaking & region",
                "Queue, ready status and server selection.",
              ),
              upcoming(
                "resources",
                "Resource alerts",
                "Fuel, heat and resupply warnings will use authoritative vehicle data.",
              ),
            ],
          },
          {
            id: "accessibility",
            label: "Accessibility",
            description:
              "Menus use text labels as well as color. These preferences are saved on this device.",
            rows: [
              {
                id: "keyboard-assist",
                label: "Keyboard assist",
                description:
                  "AUTO learns from physical typing. ON always offers the on-screen keyboard.",
                value: keyboardAssist.toUpperCase(),
                action: (dir) =>
                  useTextKeyboardStore
                    .getState()
                    .setMode(
                      step<KeyboardAssist>(
                        ["auto", "on", "off"],
                        keyboardAssist,
                        dir,
                      ),
                    ),
              },
              {
                id: "contrast",
                label: "High contrast menus",
                value: prefs.highContrast ? "On" : "Off",
                action: () =>
                  prefs.update({ highContrast: !prefs.highContrast }),
              },
              {
                id: "motion",
                label: "Reduce motion",
                description:
                  "Stops garage camera rotation and menu transitions.",
                value: prefs.reducedMotion ? "On" : "Off",
                action: () =>
                  prefs.update({ reducedMotion: !prefs.reducedMotion }),
              },
              {
                id: "text",
                label: "Menu text size",
                value: `${Math.round(prefs.menuTextScale * 100)}%`,
                action: (dir) =>
                  prefs.update({
                    menuTextScale: step(
                      [1, 1.1, 1.25],
                      prefs.menuTextScale,
                      dir,
                    ),
                  }),
              },
              upcoming(
                "subtitles",
                "Subtitles",
                "Available when voiced content is added.",
              ),
            ],
          },
          {
            id: "appearance", label: "Appearance",
            description: "Global interface theme and cockpit matching. Paint and equipped hero loadouts are in Main menu → Heroes.",
            rows: appearanceSettingsRows(prefs, prefs.update),
          },
          {
            id: "garage",
            label: "Garage",
            description:
              "Lighting, glow and reflections for the selection garage. Colors follow your interface theme.",
            rows: garageSettingsRows(
              prefs.garageEffects,
              prefs.highContrast,
              (garageEffects) => prefs.update({ garageEffects }),
            ),
          },
        ]}
      />
      {pendingBinding && (
        <div
          className="menu-surface menu-bind-dialog fixed inset-0 z-[60] flex items-center justify-center bg-black/85"
          role="dialog"
          aria-modal="true"
          aria-label="Choose keyboard binding"
        >
          <div className="menu-bind-card">
            <h2>Press a key for {BINDING_LABELS[pendingBinding]}</h2>
            <p role="status">{notice}</p>
            <button
              autoFocus
              type="button"
              className="menu-control menu-action"
              onClick={() => setPendingBinding(null)}
            >
              Cancel · Esc / B
            </button>
          </div>
        </div>
      )}
    </>
  );
}
