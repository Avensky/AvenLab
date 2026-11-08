import { type ReactNode } from "react";
import { AngledTabNavigation, type AngledHeaderTab } from "./AngledTabNavigation";
export type { AngledHeaderTab } from "./AngledTabNavigation";
import { MenuFrameHeader } from "./MenuFrame";
import "./angledTabHeader.css";

export function AngledTabHeader({
  title,
  eyebrow,
  tabs,
  activeTab,
  onTabChange,
  panelId,
  idPrefix,
  className = "",
  busy = false,
  level,
  titleMeta,
}: {
  title: string;
  eyebrow?: string;
  tabs: AngledHeaderTab[];
  activeTab: string;
  onTabChange: (tab: string) => void;
  panelId: string;
  idPrefix: string;
  className?: string;
  busy?: boolean;
  level?: number | string;
  titleMeta?: ReactNode;
}) {
  return (
    <MenuFrameHeader
      title={title}
      eyebrow={eyebrow}
      showBack={false}
      busy={busy}
      titleMeta={titleMeta ?? (level == null ? undefined : <span className="menu-header-title-meta angled-header-level">LEVEL {level}</span>)}
      variant="scene"
      className={"angled-tab-header angled-tab-header--no-back " + className}
    >
      <AngledTabNavigation title={title} tabs={tabs} activeTab={activeTab} onTabChange={onTabChange} panelId={panelId} idPrefix={idPrefix} />
    </MenuFrameHeader>
  );
}
