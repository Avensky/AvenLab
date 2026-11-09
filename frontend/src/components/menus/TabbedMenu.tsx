import {MenuTabButton} from "./MenuTabButton";
import {MenuFrame,MenuFrameHeader,MenuFrameFooter} from "./MenuFrame";
import { MenuIcon, type MenuIconName } from "./MenuIcon";
import { useAngledMenuHeader } from "./useAngledMenuHeader";
import { ControlGlyph, type ControlGlyphProps } from "../controller";
import { trapMenuFocus } from "./menuFocus";
import { useMenuPressOwner } from "./useMenuPressOwner";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import type { MenuAction } from "../../controls/inputRouting";
import "./sceneTabHeader.css";

export type MenuRow = {
  id: string;
  label: string;
  value?: string;
  shortcut?: ControlGlyphProps;
  description?: string;
  action?: (direction: 1 | -1) => void;
  adjustable?: boolean;
  disabled?: boolean;
  danger?: boolean;
};
export type MenuTab = {
  id: string;
  label: string;
  icon?: MenuIconName;
  description?: string;
  rows: MenuRow[];
  content?: ReactNode;
  preview?: ReactNode;
};

export function TabbedMenu({
  title,
  eyebrow = "REDLINE VECTOR",
  subtitle,
  tabs,
  onBack,
  backLabel = "Back",
  status,
  initialTab,
  chamferTitle = false,
}: {
  initialTab?: string;
  title: string;
  eyebrow?: string;
  subtitle?: string;
  tabs: MenuTab[];
  onBack: () => void;
  backLabel?: string;
  status?: string;
  chamferTitle?: boolean;
}) {
  const angled = useAngledMenuHeader();
  const [selection, setSelection] = useState({
    tab: tabs.find((tab) => tab.id === initialTab)?.id ?? tabs[0].id,
    row: "",
    focus: "row",
  });
  const tabIndex = Math.max(
    0,
    tabs.findIndex((tab) => tab.id === selection.tab),
  );
  const tab = tabs[tabIndex];
  const rows = tab.rows.filter((row) => !row.disabled && row.action);
  const selectedRow = rows.find((row) => row.id === selection.row) ?? rows[0];
  const selectedId = selectedRow?.id;
  const content = useRef<HTMLDivElement>(null);
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  const panelId = useId();
  const pressOwner = useMenuPressOwner();
  const tabId = `${panelId}-${tab.id}`;

  const selectTab = (index: number, focus = "row") =>
    setSelection({
      tab: tabs[(index + tabs.length) % tabs.length].id,
      row: "",
      focus,
    });
  useEffect(() => {
    // The tab strip stays visible even when the active tab is offscreen on mobile.
    document
      .getElementById(`${panelId}-${tab.id}-tab`)
      ?.scrollIntoView({ block: "nearest", inline: "nearest" });
    if (content.current) content.current.scrollTop = 0;
  }, [tab.id, panelId, angled]);
  useEffect(() => {
    const element =
      selection.focus === "tab"
        ? document.getElementById(`${panelId}-${tab.id}-tab`)
        : selectedId
          ? buttons.current.get(selectedId)
          : document.getElementById(`${panelId}-${tab.id}-tab`);
    element?.focus({ preventScroll: true });
    element?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [tab.id, selectedId, selection.focus, panelId, angled]);
  useEffect(() => {
    const handle = (event: Event) => {
      const action = (event as CustomEvent<MenuAction>).detail;
      if (action === "back") {
        onBack();
        return;
      }
      if (action === "previous_tab" || action === "next_tab") {
        const direction = action === "previous_tab" ? -1 : 1;
        setSelection({
          tab: tabs[(tabIndex + direction + tabs.length) % tabs.length].id,
          row: "",
          focus: "row",
        });
      } else if (action === "up" || action === "down") {
        if (!rows.length) return;
        const index = rows.findIndex((row) => row.id === selectedRow?.id);
        const next =
          rows[
            (index + (action === "up" ? -1 : 1) + rows.length) % rows.length
          ];
        setSelection({ tab: tab.id, row: next.id, focus: "row" });
      } else if (
        selectedRow &&
        (action === "activate" ||
          ((action === "left" || action === "right") &&
            (selectedRow.adjustable ?? Boolean(selectedRow.value))))
      ) {
        selectedRow.action?.(action === "left" ? -1 : 1);
      }
    };
    window.addEventListener("avenlab:panel-action", handle);
    return () => window.removeEventListener("avenlab:panel-action", handle);
  }, [onBack, rows, selectedRow, tab.id, tabIndex, tabs]);

  const navigation = (
    <div
      role="tablist"
      aria-label={`${title} categories`}
      className={angled ? "angled-header-tabs" : "tabbed-menu-tabs menu-frame-tabs"}
    >
      {tabs.map((item, index) => (
        <MenuTabButton
          key={item.id}
          id={`${panelId}-${item.id}-tab`}
          selected={tab.id === item.id}
          angled={angled}
          data-selected={tab.id === item.id}
          aria-controls={`${panelId}-${item.id}-panel`}
          tabIndex={tab.id === item.id ? 0 : -1}
          onClick={() => selectTab(index)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ")
              event.stopPropagation();
            if (
              ["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)
            ) {
              event.preventDefault();
              event.stopPropagation();
              const next =
                event.key === "Home"
                  ? 0
                  : event.key === "End"
                    ? tabs.length - 1
                    : (index +
                        (event.key === "ArrowLeft" ? -1 : 1) +
                        tabs.length) %
                      tabs.length;
              selectTab(next, "tab");
            }
          }}
          className={angled ? undefined : "menu-tab"}
        >
          {item.icon && <MenuIcon name={item.icon} />}
          {item.label}
        </MenuTabButton>
      ))}
    </div>
  );

  return (
    <div className="game-ui menu-surface tabbed-menu fixed inset-0 z-50 bg-slate-950 text-slate-100">
      <MenuFrame
        {...pressOwner}
        onKeyDown={trapMenuFocus}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${panelId}-title`}
        aria-describedby={subtitle ? `${panelId}-description` : undefined}
        className="menu-shell tabbed-menu-shell flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden bg-slate-950"
      >
        <MenuFrameHeader title={title} titleId={`${panelId}-title`} eyebrow={eyebrow}
          onBack={onBack} backLabel={backLabel} showBack={!angled}
          className={angled ? `angled-tab-header${chamferTitle ? " angled-tab-header--chamfered" : ""}` : "tabbed-menu-header"}>
          {angled && <div className="tabbed-angled-scroll">{navigation}</div>}
        </MenuFrameHeader>
        {subtitle&&<p id={`${panelId}-description`} className="sr-only">{subtitle}</p>}
        {!angled && navigation}
        <div
          ref={content}
          role="tabpanel"
          id={`${tabId}-panel`}
          aria-labelledby={`${tabId}-tab`}
          className={`tabbed-menu-content menu-frame-content min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain${tab.preview ? " tabbed-menu-with-preview" : ""}`}
        >
          <div className="tabbed-menu-controls">
            {tab.description && (
              <p className="menu-description">{tab.description}</p>
            )}
            <div className="menu-row-list">
              {tab.rows.map((row) => (
                <button
                  type="button"
                  key={row.id}
                  ref={(element) => {
                    if (element) buttons.current.set(row.id, element);
                    else buttons.current.delete(row.id);
                  }}
                  disabled={row.disabled || !row.action}
                  data-menu-row={row.id}
                  data-selected={selectedRow?.id === row.id}
                  data-danger={row.danger || undefined}
                  onFocus={() => {
                    if (selection.row !== row.id)
                      setSelection({ tab: tab.id, row: row.id, focus: "row" });
                  }}
                  onPointerEnter={() => {
                    if (!row.disabled && row.action && selection.row !== row.id)
                      setSelection({ tab: tab.id, row: row.id, focus: "row" });
                  }}
                  onClick={() => row.action?.(1)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ")
                      event.stopPropagation();
                  }}
                  className="menu-control menu-row"
                >
                  <span className="menu-row-copy">
                    <span className="menu-row-label">{row.label}</span>
                    {row.description && (
                      <span className="menu-row-description">
                        {row.description}
                      </span>
                    )}
                  </span>
                  {row.value && (
                    <span className="menu-row-value" data-toggle={
                      /^(on|show|enabled)$/i.test(row.value) ? "on" :
                      /^(off|hide|disabled)$/i.test(row.value) ? "off" : undefined
                    }>{row.value}</span>
                  )}
                  {row.shortcut && <ControlGlyph {...row.shortcut} />}
                </button>
              ))}
            </div>
            {tab.content && <div className="menu-extras">{tab.content}</div>}
          </div>
          {tab.preview && <div className="tabbed-menu-preview">{tab.preview}</div>}
        </div>
        <MenuFrameFooter className="tabbed-menu-footer" status={status}
          backAction={angled ? { onClick: onBack, label: backLabel } : undefined} />
      </MenuFrame>
    </div>
  );
}
