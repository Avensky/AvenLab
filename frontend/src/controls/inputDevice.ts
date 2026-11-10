export const MENU_INPUT_LABELS = {
  browser: "Browser / Mobile",
  keyboard: "Keyboard & Mouse",
  controller: "Controller",
  touch: "Touch",
} as const;

export type MenuInputPreference = keyof typeof MENU_INPUT_LABELS;
export type MenuInputDevice = Exclude<MenuInputPreference, "browser">;

export function isMobileBrowser() {
  if (typeof navigator === "undefined") return false;
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

export function resolveMenuInputDevice(preference: MenuInputPreference): MenuInputDevice {
  if (preference !== "browser") return preference;
  return isMobileBrowser() ? "touch" : "keyboard";
}
