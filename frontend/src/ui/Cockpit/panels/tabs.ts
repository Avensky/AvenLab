import type { CockpitTab } from "../../../store/menus/uiStore";
/** Stable UI route IDs. Labels/order are presentation; console/vehicle remain
 * accepted legacy routes in the shell so old shortcuts/bookmarks keep working. */
export const COCKPIT_TABS: { id: CockpitTab; label: string }[] = [
  { id: "drive", label: "DRIVE" },
  { id: "lights", label: "LIGHTS" },
  { id: "wipers", label: "WIPERS" },
  { id: "cruise", label: "CRUISE" },
  { id: "climate", label: "CLIMATE" },
  { id: "brightness", label: "BRIGHTNESS" },
  { id: "radio", label: "RADIO" },
  { id: "missions", label: "MISSIONS" },
  { id: "research", label: "RESEARCH" },
  { id: "ignition", label: "IGNITION" },
  { id: "navigation", label: "GPS" },
];
