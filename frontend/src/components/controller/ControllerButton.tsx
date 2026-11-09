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
export type BackShortcutAction = { onClick: () => void; disabled?: boolean };

export function MenuShortcuts({
  back = true,
  backAction,
  tabs = true,
  hold = false,
  chat = false,
  directions = "vertical",
  secondaryTabs = false,
  selectLabel,
  selectAction = true,
}: {
  back?: boolean;
  backAction?: BackShortcutAction;
  tabs?: boolean;
  hold?: boolean;
  chat?: boolean;
  directions?: "vertical" | "both";
  secondaryTabs?: boolean;
  selectLabel?: string;
  selectAction?: boolean;
} = {}) {
  const backHint = <><ControllerButton button="B" /> Back <kbd>Esc</kbd></>;
  return (
    <div className="controller-shortcuts" aria-label="Menu shortcuts">
      <span>
        <ControllerButton button="D-PAD" /> Navigate{" "}
        <kbd>{directions === "both" ? "↑↓ ←→" : "↑↓"}</kbd>
      </span>
      {selectAction && <span>
        <ControllerButton button="A" /> {selectLabel ?? (hold ? "Select / hold" : "Select")}{" "}
        <kbd>Enter</kbd>
      </span>}
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
      {back && (backAction ? (
        <button type="button" className="controller-shortcut-back" aria-label="Back" tabIndex={-1} disabled={backAction.disabled} onClick={backAction.onClick}>
          {backHint}
        </button>
      ) : <span>{backHint}</span>)}
    </div>
  );
}
