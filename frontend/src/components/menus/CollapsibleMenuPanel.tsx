import { useId, useState, type ReactNode } from "react";
import "./collapsibleMenuPanel.css";

export function MenuPanelHeading({ title, contentId, collapsed, toggle, children }: {
  title: string; contentId: string; collapsed: boolean; toggle: () => void; children?: ReactNode;
}) {
  return <header className="vehicle-studio-panel-heading" data-controller-row>
    <h2>{title}</h2>
    {children}
    <button type="button" className="vehicle-studio-panel-toggle"
      aria-label={`${collapsed ? "Expand" : "Minimize"} ${title.toLowerCase()}`}
      aria-expanded={!collapsed} aria-controls={contentId} onClick={toggle}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
        <path d={collapsed ? "M12 5v14M5 12h14" : "M5 12h14"} />
      </svg>
    </button>
  </header>;
}

export function CollapsibleMenuPanel({ title, summary, className = "", defaultCollapsed = false, children }: {
  title: string; summary?: ReactNode; className?: string; defaultCollapsed?: boolean; children: ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const contentId = useId();
  return <section className={`collapsible-menu-panel menu-panel-frame ${className}`} aria-label={title} data-collapsed={collapsed}>
    <MenuPanelHeading title={title} contentId={contentId} collapsed={collapsed} toggle={() => setCollapsed(value => !value)}>
      {summary && <small>{summary}</small>}
    </MenuPanelHeading>
    <div id={contentId} hidden={collapsed} className="collapsible-menu-panel-content">{children}</div>
  </section>;
}
