// Labels, routing and controller item counts share the same source of truth.
export const MAIN_MENU_ITEMS = [
  {
    id: "quickplay",
    label: "Quickplay",
    description: "Casual 5v5 · alpha lobby",
    screen: "hero_select",
    mode: "quickplay",
    available: true,
  },
  {
    id: "competitive",
    label: "Competitive",
    description: "Ranked 5v5 · alpha lobby",
    screen: "hero_select",
    mode: "competitive",
    available: true,
  },
  {
    id: "sandbox",
    label: "Sandbox / practice",
    description: "Solo testing · choose environment",
    screen: "hero_select",
    mode: "sandbox",
    available: true,
  },
  {
    id: "world_builder",
    label: "World builder",
    description: "One live editor world · build and test",
    screen: "hero_select",
    mode: "editor",
    available: true,
  },
  {
    id: "missions",
    label: "View missions",
    description: "Objectives, team roles and supply planning.",
    screen: "missions",
    available: true,
  },
  {
    id: "career",
    label: "Career",
    description: "Statistics, history, favorites and achievements.",
    screen: "career",
    available: true,
  },
  {
    id: "settings",
    label: "Settings",
    description: "Display, audio, controls and accessibility.",
    screen: "settings",
    available: true,
  },
  {
    id: "recon",
    label: "Signal Recon",
    description: "CAN capture, analysis and replay workspace.",
    screen: "signal_recon_setup",
    available: true,
  },
  {
    id: "swarm",
    label: "Swarm Command",
    description: "Planned · Multi-domain vehicle orchestration.",
    screen: "swarm",
    available: false,
  },
  {
    id: "social",
    label: "Worlds & social",
    description: "Private worlds, teammates, groups and invitations.",
    screen: "social",
    available: true,
  },
] as const;

export const PAUSE_MENU_ITEMS = [
  {
    id: "resume",
    label: "Resume game",
    description: "Return to the driver's seat.",
  },
  {
    id: "debug_menu",
    label: "Debugger",
    description: "Visualizers, models and performance captures.",
  },
  {
    id: "world_builder",
    label: "World builder",
    description: "Author a district. Shortcut: F9.",
  },
  {
    id: "settings",
    label: "Settings",
    description: "Tune display, controls and accessibility.",
  },
  {
    id: "vehicle_select",
    label: "Change vehicle",
    description: "Switch your vehicle here. Shortcut: H.",
  },
  {
    id: "cockpit",
    label: "Cockpit",
    description: "Shifter, parking brake, stalks and radio. Shortcut: F4.",
  },
  {
    id: "missions",
    label: "View missions",
    description: "Review objectives and field logistics.",
  },
  {
    id: "career",
    label: "Career",
    description: "Your record, collection and favorites.",
  },
  {
    id: "leave_game",
    label: "Leave game",
    description: "Return to the main menu.",
  },
  {
    id: "social",
    label: "Worlds & social",
    description: "Your current world, teammates and invitations.",
  },
] as const;
