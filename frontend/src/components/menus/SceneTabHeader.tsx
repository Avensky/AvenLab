import type { CSSProperties, ReactNode } from "react";
import { APP_BRANDING } from "../../theme/branding";
import type { MatchTeam } from "../../theme/matchTeamTheme";
import { MenuFrameHeader } from "./MenuFrame";
import { MenuTabButton } from "./MenuTabButton";
import { useAngledMenuHeader } from "./useAngledMenuHeader";
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
  logo,
  tabs,
  activeTab,
  onTabChange,
  tablistLabel = title + " sections",
  tablistClassName = "",
  panelId,
  idPrefix,
  onBack,
  showProgress,
  busy = false,
  level,
  titleMeta,
  titleTeam,
}: {
  title: string;
  eyebrow?: string;
  logo?: ReactNode;
  tabs: readonly SceneHeaderTab[];
  activeTab: string;
  onTabChange: (tab: string) => void;
  tablistLabel?: string;
  tablistClassName?: string;
  panelId: string;
  idPrefix: string;
  onBack?: () => void;
  showProgress?: boolean;
  busy?: boolean;
  level?: number | string;
  titleMeta?: ReactNode;
  titleTeam?: MatchTeam;
}) {
  const angled = useAngledMenuHeader();
  const navigation = (
    <nav className={`${angled ? "angled-header-tabs" : "classic-header-tabs"} ${tablistClassName}`} role="tablist" aria-label={tablistLabel} data-controller-tab-only>
      {tabs.map(tab => (
        <MenuTabButton
          key={tab.id}
          id={idPrefix + "-tab-" + tab.id}
          selected={activeTab === tab.id}
          angled={angled}
          separatorBefore={tab.separatorBefore}
          aria-controls={panelId}
          aria-label={tab.description ? `${tab.label}: ${tab.description}` : undefined}
          title={tab.description}
          tabIndex={activeTab === tab.id ? 0 : -1}
          disabled={busy}
          className={angled ? "angled-header-tab--" + tab.id : undefined}
          data-has-badge={tab.badge ? true : undefined}
          style={angled && tab.grow !== undefined ? { "--angled-tab-grow": tab.grow } as CSSProperties : undefined}
          onClick={() => onTabChange(tab.id)}
        >
          {tab.icon && <span className="scene-header-tab-icon">{tab.icon}</span>}
          <span className="scene-header-tab-label">{tab.label}</span>
          {tab.badge && <span className="scene-header-tab-badge">{tab.badge}</span>}
        </MenuTabButton>
      ))}
    </nav>
  );

  return (
    <>
      <MenuFrameHeader
        title={title}
        eyebrow={eyebrow ?? (angled ? APP_BRANDING.productName : undefined)}
        logo={logo}
        onBack={onBack}
        showBack={Boolean(onBack)}
        showProgress={showProgress}
        titleTeam={titleTeam}
        busy={busy}
        titleMeta={titleMeta ?? (level == null ? undefined : <span className="menu-header-title-meta angled-header-level">LEVEL {level}</span>)}
        variant="scene"
        className={[angled && "angled-tab-header", logo && "scene-tab-header--compact"].filter(Boolean).join(" ")}
      >
        {angled && navigation}
      </MenuFrameHeader>
      {!angled && navigation}
    </>
  );
}
