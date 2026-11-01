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
  chat = false,
  directions = "vertical",
  tabKey = false,
}: {
  back?: boolean;
  tabs?: boolean;
  hold?: boolean;
  chat?: boolean;
  directions?: "vertical" | "both";
  tabKey?: boolean;
} = {}) {
  return (
    <div className="controller-shortcuts" aria-label="Menu shortcuts">
      <span>
        <ControllerButton button="D-PAD" /> Navigate{" "}
        <kbd>{directions === "both" ? "↑↓ ←→" : "↑↓"}</kbd>
      </span>
      <span>
        <ControllerButton button="A" /> {hold ? "Select / hold" : "Select"}{" "}
        <kbd>Enter</kbd>
      </span>
      {tabs && (
        <span>
          <ControllerButton button="LB" />
          <ControllerButton button="RB" /> Tabs <kbd>{tabKey ? "Q / E · Tab" : "Q / E"}</kbd>
        </span>
      )}
      {chat && (
        <span>
          <ControllerButton button="X" /> Chat <kbd>T</kbd>
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
