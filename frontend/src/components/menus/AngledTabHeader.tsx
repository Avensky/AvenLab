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
}) {
  return (
    <MenuFrameHeader
      title={title}
      eyebrow={eyebrow}
      showBack={false}
      busy={busy}
      titleMeta={level == null ? undefined : <span className="angled-header-level">LEVEL {level}</span>}
      variant="scene"
      className={"angled-tab-header angled-tab-header--no-back " + className}
    >
      <AngledTabNavigation title={title} tabs={tabs} activeTab={activeTab} onTabChange={onTabChange} panelId={panelId} idPrefix={idPrefix} />
    </MenuFrameHeader>
  );
}
