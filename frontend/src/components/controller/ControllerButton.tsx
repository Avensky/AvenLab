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
  secondaryTabs = false,
}: {
  back?: boolean;
  tabs?: boolean;
  hold?: boolean;
  chat?: boolean;
  directions?: "vertical" | "both";
  secondaryTabs?: boolean;
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
          <ControllerButton button="RB" /> Tabs <kbd>Q / E</kbd>
        </span>
      )}
      {secondaryTabs && <span><ControllerButton button="LT" /><ControllerButton button="RT" /> Field <kbd>1 / 3</kbd></span>}
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
