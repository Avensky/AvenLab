import { calibratedSteering, controllerAxis } from "../../controls/controllerAxes";
import { MenuIcon } from "../../components/menus/MenuIcon";
import type { Preferences } from "../../store/preferences/preferencesStore";
import "./calibrationPreview.css";

type CalibrationTab = "display" | "hud" | "keyboard" | "controller";
type CalibrationPreferences = Pick<Preferences,
  "fov" | "cameraSensitivity" | "controllerDeadzone" | "steeringSensitivity" |
  "invertSteering" | "turretYawSensitivity" | "turretPitchSensitivity" | "wheelDrop" |
  "steeringTravel" | "minimapScale"
>;
const percent = (value: number) => `${Math.round(value * 100)}%`;
const sampleStick = 0.32;

export function CalibrationPreview({ tab, preferences }: {
  tab: CalibrationTab;
  preferences: CalibrationPreferences;
}) {
  const {
    fov, cameraSensitivity, controllerDeadzone, turretYawSensitivity,
    turretPitchSensitivity, wheelDrop, steeringTravel, minimapScale,
  } = preferences;
  const stick = controllerAxis(sampleStick, controllerDeadzone);
  const steer = calibratedSteering(sampleStick, preferences);
  const zoom = Math.tan(75 * Math.PI / 360) / Math.tan(fov * Math.PI / 360);
  const offset = tab === "controller" ? -steer * 55 : tab === "keyboard" ? -cameraSensitivity * 17 : 0;
  const values: [string, string][] = [["Field of view", `${fov}°`]];
  if (tab === "keyboard") values.push(["Mouse look", `${cameraSensitivity}×`]);
  if (tab === "hud") values.push(
    ["Wheel drop", percent(wheelDrop)], ["Thumb travel", percent(steeringTravel)],
    ["Minimap size", percent(minimapScale)],
  );
  if (tab === "controller") values.push(
    ["Sample stick", percent(sampleStick)],
    ["Deadzone", percent(controllerDeadzone)],
    ["Steering output", percent(steer)],
    ["Aim yaw", `${turretYawSensitivity}×`],
    ["Aim pitch", `${turretPitchSensitivity}×`],
  );

  return (
    <figure className="calibration-preview" data-calibration-preview={tab} aria-label="POV calibration preview">
      <figcaption><MenuIcon name={tab} /> <strong>POV preview</strong></figcaption>
      <svg className="calibration-scene" viewBox="0 0 320 180" aria-hidden="true" focusable="false">
        <path className="calibration-ground" d="M0 77h320v103H0z" />
        <g className="calibration-world" transform={`translate(${offset} 0) translate(160 77) scale(${zoom}) translate(-160 -77)`}>
          <path className="calibration-skyline" d="M-100 77V57h124V46h22v14h17V36h24v26h28v15m86 0V55h18V40h25v17h16V27h22v29h22v-9h116v30z" />
          <path className="calibration-road" d="M146 77h28l232 143H-86Z" />
          <path className="calibration-lanes" d="M146 77-34 189m208-112 180 112m-194-105v6m0 8v10m0 10v15m0 13v24m0 15v28" />
          <path className="calibration-markers" d="M105 121v-17h-5m115 17v-17h5M56 154v-21H44m220 21v-21h12" />
        </g>
        {tab === "controller" && (
          <g className="calibration-reticle" transform={`translate(${160 + stick * turretYawSensitivity * 42} ${91 + stick * turretPitchSensitivity * 28})`}>
            <circle r="10" />
            <path d="M-15 0h8m14 0h8M0-15v8m0 14v8" />
          </g>
        )}
        {tab === "hud" && (
          <>
            <g className="calibration-reticle" transform={`translate(160 ${148 + wheelDrop * 42})`}>
              <circle r="25" />
              <path d="M-23 0h46M0 0v24" />
              <path d={`M${-22 * steeringTravel} -28h${44 * steeringTravel}`} />
            </g>
            <g className="calibration-reticle" transform={`translate(10 10) scale(${minimapScale})`}>
              <rect width="36" height="27" />
              <path d="M4 19h12V7h14" />
            </g>
          </>
        )}
      </svg>
      <dl className="calibration-values">
        {values.map(([label, value]) => (
          <div key={label}><dt>{label}</dt><dd>{value}</dd></div>
        ))}
      </dl>
    </figure>
  );
}
