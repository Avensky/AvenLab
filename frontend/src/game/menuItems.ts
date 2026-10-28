// Labels, routing and controller item counts share the same source of truth.
export const MAIN_MENU_ITEMS = [
  { id: "sandbox", label: "Sandbox", description: "Explore the city. Learn your vehicle. Plan your route.", screen: "sandbox_setup", available: true },
  { id: "missions", label: "View missions", description: "Objectives, team roles and supply planning.", screen: "missions", available: true },
  { id: "career", label: "Career", description: "Statistics, history, favorites and achievements.", screen: "career", available: true },
  { id: "settings", label: "Settings", description: "Display, audio, controls and accessibility.", screen: "settings", available: true },
  { id: "recon", label: "Signal Recon", description: "CAN capture, analysis and replay workspace.", screen: "signal_recon_setup", available: true },
  { id: "swarm", label: "Swarm Command", description: "Planned · Multi-domain vehicle orchestration.", screen: "swarm", available: false },
] as const;

export const PAUSE_MENU_ITEMS = [
  { id: "resume", label: "Resume game", description: "Return to the driver's seat." },
  { id: "debug_menu", label: "Debugger", description: "Visualizers, models and performance captures." },
  { id: "settings", label: "Settings", description: "Tune display, controls and accessibility." },
  { id: "vehicle_select", label: "Change vehicle", description: "Switch your vehicle here. Shortcut: H." },
  { id: "cockpit", label: "Cockpit", description: "Shifter, parking brake, stalks and radio. Shortcut: F4." },
  { id: "missions", label: "View missions", description: "Review objectives and field logistics." },
  { id: "career", label: "Career", description: "Your record, collection and favorites." },
  { id: "leave_game", label: "Leave game", description: "Return to the main menu." },
] as const;
