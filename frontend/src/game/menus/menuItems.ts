// Labels, routing and controller item counts share the same source of truth.
export const MAIN_MENU_ITEMS = [
  {
    id: "play",
    label: "Play",
    description: "Choose a game mode and vehicle.",
    screen: "hero_select",
    available: true,
  },
  {
    id: "career",
    label: "Career",
    description: "Statistics, collection and milestones.",
    screen: "career",
    available: true,
  },
  {
    id: "social",
    label: "Worlds & social",
    description: "Teammates, groups and private worlds.",
    screen: "social",
    available: true,
  },
  {
    id: "settings",
    label: "Settings",
    description: "Display, audio, controls and accessibility.",
    screen: "settings",
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
