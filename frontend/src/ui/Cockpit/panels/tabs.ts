import type { CockpitTab } from "../../../store/menus/uiStore";
/** Stable UI route IDs. Labels/order are presentation; console/vehicle remain
 * accepted legacy routes in the shell so old shortcuts/bookmarks keep working. */
export const COCKPIT_TABS: { id: CockpitTab; label: string }[] = [
  { id: "drive", label: "DRIVE" },
  { id: "lights", label: "COLUMN" },
  { id: "brightness", label: "DASHBOARD" },
  { id: "radio", label: "CONSOLE" },
  { id: "turret", label: "TURRET" },
  { id: "missions", label: "MISSIONS" },
  { id: "research", label: "RESEARCH" },
  { id: "ignition", label: "IGNITION" },
  { id: "navigation", label: "GPS" },
];

export const cockpitParent = (tab: CockpitTab): CockpitTab => ["lights","wipers","cruise"].includes(tab) ? "lights" : tab === "climate" ? "radio" : tab;
