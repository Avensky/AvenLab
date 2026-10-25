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
    <section onKeyDown={trapMenuFocus} role="dialog" aria-modal="true" aria-labelledby={`${panelId}-title`} className="menu-shell tabbed-menu-shell flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden bg-slate-950">
      <header className="tabbed-menu-header flex shrink-0 items-start justify-between gap-4 border-b border-slate-800 px-4 py-3 sm:px-8 sm:py-5">
        <div><p className="text-xs font-bold tracking-[0.25em] text-cyan-300">{eyebrow}</p>
          <h1 id={`${panelId}-title`} className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">{title}</h1>
          {subtitle && <p className="mt-2 max-w-3xl text-sm text-slate-400">{subtitle}</p>}
        </div>
        <button type="button" onClick={onBack} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") event.stopPropagation(); }} className="menu-back shrink-0 rounded-lg border border-slate-600 px-4 py-2 text-sm font-bold hover:border-yellow-300 focus-visible:outline-2 focus-visible:outline-yellow-300">{backLabel} <span aria-hidden="true" className="ml-2 text-yellow-300">↵</span></button>
      </header>
      <div role="tablist" aria-label={`${title} categories`} className="tabbed-menu-tabs flex shrink-0 gap-1 overflow-x-auto border-b border-slate-800 bg-slate-900/50 px-4 py-3 sm:px-7">
        {tabs.map((item, index) => <button type="button" key={item.id} id={`${panelId}-${item.id}-tab`} role="tab" aria-selected={tab.id === item.id}
          aria-controls={`${panelId}-${item.id}-panel`} tabIndex={tab.id === item.id ? 0 : -1} onClick={() => selectTab(index)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") event.stopPropagation();
            if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
              event.preventDefault(); event.stopPropagation();
              const next = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : (index + (event.key === "ArrowLeft" ? -1 : 1) + tabs.length) % tabs.length;
              selectTab(next, "tab");
            }
          }}
          className={`whitespace-nowrap rounded-lg px-4 py-2.5 text-sm font-bold transition focus-visible:outline-2 focus-visible:outline-yellow-300 ${tab.id === item.id ? "bg-yellow-300 text-slate-950" : "text-slate-400 hover:bg-slate-800 hover:text-white"}`}>{item.label}</button>)}
      </div>
      <div ref={content} role="tabpanel" id={`${tabId}-panel`} aria-labelledby={`${tabId}-tab`} className="tabbed-menu-content min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain px-4 py-4 sm:px-8">
        {tab.description && <p className="mb-5 max-w-4xl text-sm leading-relaxed text-slate-400">{tab.description}</p>}
        <div className="grid gap-2">
          {tab.rows.map((row) => <button type="button" key={row.id} ref={(element) => { if (element) buttons.current.set(row.id, element); else buttons.current.delete(row.id); }}
            disabled={row.disabled || !row.action} data-menu-row={row.id} onFocus={() => { if (selection.row !== row.id) setSelection({ tab: tab.id, row: row.id, focus: "row" }); }}
            onPointerEnter={() => { if (!row.disabled && row.action && selection.row !== row.id) setSelection({ tab: tab.id, row: row.id, focus: "row" }); }}
            onClick={() => row.action?.(1)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") event.stopPropagation(); }}
            className={`menu-row flex min-h-16 w-full items-center justify-between gap-5 rounded-xl border px-4 py-3 text-left transition disabled:opacity-50 ${selectedRow?.id === row.id ? "border-yellow-300 bg-yellow-300/10 ring-1 ring-yellow-300/40" : "border-slate-800 bg-slate-900/65 hover:border-slate-500"} ${row.danger ? "text-rose-300" : "text-slate-100"}`}>
            <span><span className="block text-sm font-bold">{row.label}</span>{row.description && <span className="mt-1 block text-xs font-normal leading-relaxed text-slate-400">{row.description}</span>}</span>
            {row.value && <span className="shrink-0 text-right text-sm font-bold text-cyan-200">{row.value}</span>}
          </button>)}
        </div>
        {tab.content}
      </div>
      <footer className="tabbed-menu-footer flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-slate-800 px-5 py-3 text-xs text-slate-400 sm:px-8">
        <p><span className="font-bold text-yellow-300">D-pad / ↑↓</span> Navigate · <span className="font-bold text-yellow-300">A / Enter</span> Select · ←→ Adjust · <span className="font-bold text-yellow-300">LB/RB / Q/E</span> Tabs · B / Esc Back</p>
        {status && <p role="status" className="text-cyan-200">{status}</p>}
      </footer>
    </section>
  </div>;
}
