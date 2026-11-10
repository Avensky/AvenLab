import { ControlGlyph } from "./ControlGlyph";
import { useMenuInputDevice } from "./useMenuInputDevice";

export type BackShortcutAction = { onClick: () => void; disabled?: boolean; label?: string };

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
  navigate = true,
  menuToggle = false,
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
  navigate?: boolean;
  menuToggle?: boolean;
} = {}) {
  const device = useMenuInputDevice();
  const touch = device === "touch";
  const backLabel = backAction?.label ?? "Back";
  const backHint = <><ControlGlyph controller="B" /> {backLabel}</>;
  return (
    <div className="controller-shortcuts" data-input-device={device} aria-label="Menu shortcuts">
      {!touch && <>
        {menuToggle && device === "controller" && <span><ControlGlyph controller="MENU" /> Menu</span>}
        {navigate && <span data-shortcut="navigate">
          <ControlGlyph controller="D-PAD" keyboard={directions === "both" ? "↑↓ ←→" : "↑↓"} /> Navigate
        </span>}
        {selectAction && <span><ControlGlyph controller="A" /> {selectLabel ?? (hold ? "Select / hold" : "Select")}</span>}
        {tabs && <span><ControlGlyph controller={["LB", "RB"]} keyboard="Q / E" /> Tabs</span>}
        {secondaryTabs && <span><ControlGlyph controller={["LT", "RT"]} keyboard="1 / 3" /> Field</span>}
        {chat && <span><ControlGlyph controller="X" keyboard="T" /> Chat</span>}
      </>}
      {back && (backAction ? (
        <button type="button" className="controller-shortcut-back" aria-label={backLabel} disabled={backAction.disabled} onClick={backAction.onClick}
          onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") event.stopPropagation(); }}>
          {backHint}
        </button>
      ) : !touch && <span>{backHint}</span>)}
    </div>
  );
}
