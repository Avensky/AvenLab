import { trapMenuFocus } from "./menuFocus";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import type { MenuAction } from "../../store/tools/inputRouting";

export type MenuRow = {
  id: string;
  label: string;
  value?: string;
  description?: string;
  action?: (direction: 1 | -1) => void;
  adjustable?: boolean;
  disabled?: boolean;
  danger?: boolean;
};
export type MenuTab = { id: string; label: string; description?: string; rows: MenuRow[]; content?: ReactNode };

export function TabbedMenu({ title, eyebrow = "REDLINE VECTOR", subtitle, tabs, onBack, backLabel = "Back", status }: {
  title: string; eyebrow?: string; subtitle?: string; tabs: MenuTab[];
  onBack: () => void; backLabel?: string; status?: string;
}) {
  const [selection, setSelection] = useState({ tab: tabs[0].id, row: "", focus: "row" });
  const tabIndex = Math.max(0, tabs.findIndex((tab) => tab.id === selection.tab));
  const tab = tabs[tabIndex];
  const rows = tab.rows.filter((row) => !row.disabled && row.action);
  const selectedRow = rows.find((row) => row.id === selection.row) ?? rows[0];
  const selectedId = selectedRow?.id;
  const content = useRef<HTMLDivElement>(null);
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  const panelId = useId();
  const tabId = `${panelId}-${tab.id}`;

  const selectTab = (index: number, focus = "row") => setSelection({ tab: tabs[(index + tabs.length) % tabs.length].id, row: "", focus });
  useEffect(() => {
    // The tab strip stays visible even when the active tab is offscreen on mobile.
    document.getElementById(`${panelId}-${tab.id}-tab`)?.scrollIntoView({ block: "nearest", inline: "nearest" });
    if (content.current) content.current.scrollTop = 0;
  }, [tab.id, panelId]);
  useEffect(() => {
    const element = selection.focus === "tab" ? document.getElementById(`${panelId}-${tab.id}-tab`)
      : selectedId ? buttons.current.get(selectedId) : document.getElementById(`${panelId}-${tab.id}-tab`);
    element?.focus({ preventScroll: true });
    element?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [tab.id, selectedId, selection.focus, panelId]);
  useEffect(() => {
    const handle = (event: Event) => {
      const action = (event as CustomEvent<MenuAction>).detail;
      if (action === "back") { onBack(); return; }
      if (action === "previous_tab" || action === "next_tab") {
        const direction = action === "previous_tab" ? -1 : 1;
        setSelection({ tab: tabs[(tabIndex + direction + tabs.length) % tabs.length].id, row: "", focus: "row" });
      } else if (action === "up" || action === "down") {
        if (!rows.length) return;
        const index = rows.findIndex((row) => row.id === selectedRow?.id);
        const next = rows[(index + (action === "up" ? -1 : 1) + rows.length) % rows.length];
        setSelection({ tab: tab.id, row: next.id, focus: "row" });
      } else if (selectedRow && (action === "activate" || ((action === "left" || action === "right") && (selectedRow.adjustable ?? Boolean(selectedRow.value))))) {
        selectedRow.action?.(action === "left" ? -1 : 1);
      }
    };
    window.addEventListener("avenlab:panel-action", handle);
    return () => window.removeEventListener("avenlab:panel-action", handle);
  }, [onBack, rows, selectedRow, tab.id, tabIndex, tabs]);

  return <div className="game-ui menu-surface tabbed-menu fixed inset-0 z-50 bg-slate-950 text-slate-100">
    <section onKeyDown={trapMenuFocus} role="dialog" aria-modal="true" aria-labelledby={`${panelId}-title`} aria-describedby={subtitle ? `${panelId}-description` : undefined} className="menu-shell tabbed-menu-shell flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden bg-slate-950">
      <header className="tabbed-menu-header">
        <h1 id={`${panelId}-title`} className="menu-heading">
          <span className="menu-heading-title">{title}</span>
          <span className="menu-heading-eyebrow">{eyebrow}</span>
        </h1>
        {subtitle && <p id={`${panelId}-description`} className="sr-only">{subtitle}</p>}
        <button type="button" onClick={onBack} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") event.stopPropagation(); }} className="menu-control menu-back"><span aria-hidden="true" className="menu-key">B</span>{backLabel}</button>
      </header>
      <div role="tablist" aria-label={`${title} categories`} className="tabbed-menu-tabs">
        {tabs.map((item, index) => <button type="button" key={item.id} id={`${panelId}-${item.id}-tab`} role="tab" aria-selected={tab.id === item.id}
          data-selected={tab.id === item.id}
          aria-controls={`${panelId}-${item.id}-panel`} tabIndex={tab.id === item.id ? 0 : -1} onClick={() => selectTab(index)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") event.stopPropagation();
            if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
              event.preventDefault(); event.stopPropagation();
              const next = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : (index + (event.key === "ArrowLeft" ? -1 : 1) + tabs.length) % tabs.length;
              selectTab(next, "tab");
            }
          }}
          className="menu-control menu-tab">{item.label}</button>)}
      </div>
      <div ref={content} role="tabpanel" id={`${tabId}-panel`} aria-labelledby={`${tabId}-tab`} className="tabbed-menu-content min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain">
        {tab.description && <p className="menu-description">{tab.description}</p>}
        <div className="menu-row-list">
          {tab.rows.map((row) => <button type="button" key={row.id} ref={(element) => { if (element) buttons.current.set(row.id, element); else buttons.current.delete(row.id); }}
            disabled={row.disabled || !row.action} data-menu-row={row.id} data-selected={selectedRow?.id === row.id} data-danger={row.danger || undefined} onFocus={() => { if (selection.row !== row.id) setSelection({ tab: tab.id, row: row.id, focus: "row" }); }}
            onPointerEnter={() => { if (!row.disabled && row.action && selection.row !== row.id) setSelection({ tab: tab.id, row: row.id, focus: "row" }); }}
            onClick={() => row.action?.(1)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") event.stopPropagation(); }}
            className="menu-control menu-row">
            <span className="menu-row-copy"><span className="menu-row-label">{row.label}</span>{row.description && <span className="menu-row-description">{row.description}</span>}</span>
            {row.value && <span className="menu-row-value">{row.value}</span>}
          </button>)}
        </div>
        {tab.content && <div className="menu-extras">{tab.content}</div>}
      </div>
      <footer className="tabbed-menu-footer" data-has-status={Boolean(status)}>
        <p className="sr-only">D-pad or arrows navigate. A or Enter selects. Left and right adjust. LB/RB or Q/E switch tabs. B or Escape goes back.</p>
        {status && <p role="status">{status}</p>}
      </footer>
    </section>
  </div>;
}
