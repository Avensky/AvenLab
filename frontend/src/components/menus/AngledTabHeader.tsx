import { type CSSProperties, type ReactNode } from "react";
import { MenuFrameHeader } from "./MenuFrame";
import "./angledTabHeader.css";

export type AngledHeaderTab = {
  id: string;
  label: string;
  description: string;
  icon: ReactNode;
  grow?: number;
  separatorBefore?: boolean;
};

export function AngledTabHeader({
  title,
  eyebrow,
  tabs,
  activeTab,
  onTabChange,
  onBack,
  panelId,
  idPrefix,
  className = "",
  busy = false,
}: {
  title: string;
  eyebrow?: string;
  tabs: AngledHeaderTab[];
  activeTab: string;
  onTabChange: (tab: string) => void;
  onBack: () => void;
  panelId: string;
  idPrefix: string;
  className?: string;
  busy?: boolean;
}) {
  return (
    <MenuFrameHeader
      title={title}
      eyebrow={eyebrow}
      onBack={onBack}
      busy={busy}
      variant="scene"
      className={"angled-tab-header " + className}
    >
      <nav className="angled-header-tabs" role="tablist" aria-label={title + " sections"}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={idPrefix + "-tab-" + tab.id}
            aria-selected={activeTab === tab.id}
            aria-controls={panelId}
            aria-label={tab.label + ": " + tab.description}
            title={tab.description}
            className={"angled-header-tab angled-header-tab--" + tab.id}
            style={{ "--angled-tab-grow": tab.grow ?? 1 } as CSSProperties}
            onClick={() => onTabChange(tab.id)}
          >
            {tab.separatorBefore && <span className="angled-header-divider" aria-hidden="true" />}
            <span className="angled-header-icon">{tab.icon}</span>
            <span className="angled-header-label">{tab.label}</span>
            <svg className="angled-header-edge" viewBox="0 0 18 72" preserveAspectRatio="none" aria-hidden="true">
              <path d="M17 0 1 72" />
            </svg>
          </button>
        ))}
      </nav>
    </MenuFrameHeader>
  );
}
