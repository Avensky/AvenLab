import type { CSSProperties, ReactNode } from "react";
import { usePreferencesStore, type MenuHeaderStyle } from "../../store/preferences/preferencesStore";
import { APP_BRANDING } from "../../theme/branding";
import { MenuFrameHeader } from "./MenuFrame";
import "./sceneTabHeader.css";

export type SceneHeaderTab = {
  id: string;
  label: string;
  description?: string;
  icon?: ReactNode;
  badge?: string;
  grow?: number;
  separatorBefore?: boolean;
};

/** Both layouts share the same tabs and actions. Scenes retain their own input routing. */
export function SceneTabHeader({
  title,
  eyebrow,
  tabs,
  activeTab,
  onTabChange,
  selectOnFocus = false,
  tablistLabel = title + " sections",
  tablistClassName = "",
  panelId,
  idPrefix,
  layout,
  onBack,
  busy = false,
  level,
  titleMeta,
}: {
  title: string;
  eyebrow?: string;
  tabs: readonly SceneHeaderTab[];
  activeTab: string;
  onTabChange: (tab: string) => void;
  selectOnFocus?: boolean;
  tablistLabel?: string;
  tablistClassName?: string;
  panelId: string;
  idPrefix: string;
  layout?: MenuHeaderStyle;
  onBack?: () => void;
  busy?: boolean;
  level?: number | string;
  titleMeta?: ReactNode;
}) {
  const angled = usePreferencesStore(state => (layout ?? state.menuHeaderStyle) === "angled");
  const navigation = (
    <nav className={`${angled ? "angled-header-tabs" : "classic-header-tabs"} ${tablistClassName}`} role="tablist" aria-label={tablistLabel} data-controller-tab-only>
      {tabs.map(tab => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          id={idPrefix + "-tab-" + tab.id}
          aria-selected={activeTab === tab.id}
          aria-controls={panelId}
          aria-label={tab.description ? `${tab.label}: ${tab.description}` : undefined}
          title={tab.description}
          tabIndex={activeTab === tab.id ? 0 : -1}
          disabled={busy}
          className={angled ? "angled-header-tab angled-header-tab--" + tab.id : "menu-control"}
          data-has-badge={tab.badge ? true : undefined}
          style={angled && tab.grow !== undefined ? { "--angled-tab-grow": tab.grow } as CSSProperties : undefined}
          onFocus={selectOnFocus ? () => onTabChange(tab.id) : undefined}
          onClick={() => onTabChange(tab.id)}
        >
          {tab.icon && <span className="scene-header-tab-icon">{tab.icon}</span>}
          <span className="scene-header-tab-label">{tab.label}</span>
          {tab.badge && <span className="scene-header-tab-badge">{tab.badge}</span>}
          {angled && (
            <svg className="angled-header-edge" data-separator={tab.separatorBefore || undefined} viewBox="0 0 18 72" preserveAspectRatio="none" aria-hidden="true">
              <path d="M18 0 0 72" />
            </svg>
          )}
        </button>
      ))}
    </nav>
  );

  return (
    <>
      <MenuFrameHeader
        title={title}
        eyebrow={eyebrow ?? (angled ? APP_BRANDING.productName : undefined)}
        onBack={onBack}
        showBack={Boolean(onBack)}
        busy={busy}
        titleMeta={titleMeta ?? (level == null ? undefined : <span className="menu-header-title-meta angled-header-level">LEVEL {level}</span>)}
        variant="scene"
        className={angled ? "angled-tab-header" : ""}
      >
        {angled && navigation}
      </MenuFrameHeader>
      {!angled && navigation}
    </>
  );
}
