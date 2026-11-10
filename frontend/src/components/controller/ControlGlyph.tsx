import { ControllerButton, type ControllerKey } from "./ControllerButton";
import { useMenuInputDevice } from "./useMenuInputDevice";

export type ControlGlyphProps = {
  controller?: ControllerKey | readonly ControllerKey[];
  keyboard?: string | null;
};

export function ControlGlyph({ controller, keyboard }: ControlGlyphProps) {
  const device = useMenuInputDevice();
  if (device === "controller" && controller) {
    const buttons = typeof controller === "string" ? [controller] : controller;
    return buttons.map((button) => <ControllerButton key={button} button={button} />);
  }
  if (device !== "keyboard") return null;
  const key = keyboard === undefined
    ? controller === "A" ? "Enter" : controller === "B" ? "Esc" : null
    : keyboard;
  return key && <kbd className="keyboard-key" data-keyboard-key={key}>{key}</kbd>;
}
