import type { ReactNode } from "react";
import {
  usePreferencesStore,
  type HudGroupId,
} from "../store/preferences/preferencesStore";

// Visibility is configured in Settings. Components own their compact controls.
export function HudGroup({
  id,
  title,
  children,
  className = "",
}: {
  id: HudGroupId;
  title: string;
  children: ReactNode;
  className?: string;
  defaultCollapsed?: boolean;
}) {
  const visible = usePreferencesStore((s) => s.hudGroups[id]);
  return visible ? (
    <section
      className={`hud-group ${className}`}
      data-hud-group={id}
      aria-label={`${title} group`}
    >
      {children}
    </section>
  ) : null;
}
