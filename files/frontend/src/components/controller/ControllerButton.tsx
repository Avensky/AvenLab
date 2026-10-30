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
  | "D-PAD";
/** Xbox glyphs keep a black fill and semantic face-button color in every theme. */
export function ControllerButton({ button }: { button: ControllerKey }) {
  return (
    <kbd
      className="controller-key"
      data-controller-key={button}
      aria-label={`Xbox ${button}`}
    >
      {button}
    </kbd>
  );
}
export function MenuShortcuts({
  back = true,
  tabs = true,
  hold = false,
}: { back?: boolean; tabs?: boolean; hold?: boolean } = {}) {
  return (
    <div className="controller-shortcuts" aria-label="Menu shortcuts">
      <span>
        <ControllerButton button="D-PAD" /> Navigate <kbd>↑↓</kbd>
      </span>
      <span>
        <ControllerButton button="A" /> {hold ? "Select / hold" : "Select"}{" "}
        <kbd>Enter</kbd>
      </span>
      {tabs && (
        <span>
          <ControllerButton button="LB" />
          <ControllerButton button="RB" /> Tabs <kbd>Q / E</kbd>
        </span>
      )}
      {back && (
        <span>
          <ControllerButton button="B" /> Back <kbd>Esc</kbd>
        </span>
      )}
    </div>
  );
}
