import { type CSSProperties, type ReactNode } from "react";

export type AngledHeaderTab = {
  id: string;
  label: string;
  description: string;
  icon: ReactNode;
  grow?: number;
  separatorBefore?: boolean;
};

/** Full-width tab strip kept structurally separate from the title panel. */
export function AngledTabNavigation({
  title,
  tabs,
  activeTab,
  onTabChange,
  panelId,
  idPrefix,
}: {
  title: string;
  tabs: AngledHeaderTab[];
  activeTab: string;
  onTabChange: (tab: string) => void;
  panelId: string;
  idPrefix: string;
}) {
  return (
    <nav className="angled-header-tabs" role="tablist" aria-label={title + " sections"}>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          id={idPrefix + "-tab-" + tab.id}
          aria-selected={activeTab === tab.id}
          tabIndex={activeTab === tab.id ? 0 : -1}
          aria-controls={panelId}
          aria-label={tab.label + ": " + tab.description}
          title={tab.description}
          className={"angled-header-tab angled-header-tab--" + tab.id}
          style={{ "--angled-tab-grow": tab.grow ?? 1 } as CSSProperties}
          onClick={() => onTabChange(tab.id)}
        >
          <span className="angled-header-icon">{tab.icon}</span>
          <span className="angled-header-label">{tab.label}</span>
          <svg className="angled-header-edge" data-separator={tab.separatorBefore || undefined} viewBox="0 0 18 72" preserveAspectRatio="none" aria-hidden="true">
            <path d="M18 0 0 72" />
          </svg>
        </button>
      ))}
    </nav>
  );
}
