export type MenuScreen =
  | "loading"
  | "main"
  | "world_builder"
  | "sandbox_setup"
  | "sandbox"
  | "signal_recon"
  | "signal_recon_setup"
  | "signal_recon_mission"
  | "swarm"
  | "settings"
  | "vehicle_select"
  | "career"
  | "missions";

export type UIOverlay =
  | null
  | "pause"
  | "debug_menu"
  | "settings"
  | "vehicle_select"
  | "career"
  | "missions"
  | "leave_game"
  | "cockpit"
  | "world_builder";
export type CockpitTab =
  | "climate"
  | "drive"
  | "lights"
  | "wipers"
  | "cruise"
  | "radio"
  | "vehicle"
  | "console"
  | "ignition"
  | "navigation"
  | "missions"
  | "research";

export type MenuId =
  "main" | "pause" | "settings" | "sandbox_setup" | "signal_recon_setup";

// Only Sandbox owns driving controls and the in-game pause stack.
export const isDrivingScreen = (screen: MenuScreen) => screen === "sandbox";

export type SignalMission = {
  id: string;
  title: string;
  target: string;
  status: string;
};

export type UIState = {
  settingsTab: string;
  openSettings: (tab?: string) => void;
  cockpitTab: CockpitTab;
  setCockpitTab: (tab: CockpitTab) => void;
  openCockpit: (tab?: CockpitTab) => void;
  screen: MenuScreen;
  setScreen: (screen: MenuScreen) => void;

  overlay: UIOverlay;
  setOverlay: (overlay: UIOverlay) => void;
  vehicleSelectionParent: "pause" | null;
  openVehicleSelection: () => void;
  debugMenuParent: "pause" | null;
  toggleDebugMenu: () => void;

  selectedMenuIndexById: Record<MenuId, number>;

  isModeLoading: boolean;
  startModeLoading: (screen: MenuScreen, label?: string) => void;

  loadingLabel: string;
  finishModeLoading: () => void;

  loadingProgress: number;
  setLoadingProgress: (value: number) => void;

  getActiveMenuId: () => MenuId | null;
  getActiveMenuIndex: () => number;
  setActiveMenuIndex: (index: number) => void;

  moveActiveMenuSelection: (dir: 1 | -1) => void;
  activateActiveMenuSelection: () => void;

  openPause: () => void;
  closeOverlay: () => void;
  backToParentMenu: () => void;
  togglePauseMenu: () => void;

  moveActiveMenuHorizontal: (dir: 1 | -1) => void;

  selectedMission: SignalMission | null;
  setSelectedMission: (mission: SignalMission | null) => void;
};
