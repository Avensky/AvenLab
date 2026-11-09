import "./controller.css";
export type ControllerKey =
  | "A"
  | "B"
  | "X"
  | "Y"
  | "LB"
  | "RB"
  | "LT"
  | "RT"
  | "LS"
  | "RS"
  | "VIEW"
  | "START"
  | "MENU"
  | "D-PAD";
/** Xbox glyphs keep a black fill and semantic face-button color in every theme. */
export function ControllerButton({ button }: { button: ControllerKey }) {
  return (
    <kbd
      className="controller-key"
      data-controller-key={button}
      aria-label={button === "MENU" ? "Xbox Menu" : `Xbox ${button}`}
    >
      {button === "MENU" ? <span className="controller-menu-icon" aria-hidden="true" /> : button}
    </kbd>
  );
}
