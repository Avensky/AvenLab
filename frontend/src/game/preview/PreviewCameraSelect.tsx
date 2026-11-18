import type { ReactNode } from "react";
import { MenuIcon } from "../../components/menus/MenuIcon";
import { PreviewToolButton } from "./PreviewToolButton";
import { PREVIEW_BOOT_ICON, PREVIEW_HAND_ICON, PreviewCameraChoiceIcon } from "./PreviewToolIcon";

const FRAME = "M8 3H3v5m13-5h5v5m0 8v5h-5M3 16v5h5";
const VIEW_ICONS: Record<string, string> = {
  "Full body": `${FRAME} M12 6h.01M8 10l4 1 4-1m-4 1v4m0 0-2 3m2-3 2 3`,
  Face: `${FRAME} M8 8l4-2 4 2v6l-4 3-4-3zm2 3h.01m4 0h.01m-3 3h2`,
  "Upper body": "M8 5l4 3 4-3 4 3-2 5-2-1v7H8v-7l-2 1-2-5zM12 8v11",
  Waist: "M7 5v5l-2 9h14l-2-9V5M6 13h4m4 0h4m-8-2h4v4h-4z",
  Hands: PREVIEW_HAND_ICON,
  Feet: PREVIEW_BOOT_ICON,
  Back: `${FRAME} M7 13l2-5 3-1 3 1 2 5m-5-6v10m-3-3h6`,
  Left: `${FRAME} M17 12H7m0 0 4-4m-4 4 4 4`,
  Right: `${FRAME} M7 12h10m0 0-4-4m4 4-4 4`,
  Showroom: `${FRAME} M7 11l1-3h8l1 3 2 2v3H5v-3zM8 13h1m6 0h1`,
  "High Angle": `${FRAME} M12 6v11m-4-4 4 4 4-4`,
  "Driver Door": "M5 5h11l3 7v7H5zM5 12h14m-10 3h3",
  Cockpit: "M20 12a8 8 0 1 1-16 0 8 8 0 0 1 16 0ZM4 11h16m-8 0v9",
  Chase: `${FRAME} M6 15v-4l2-2h8l2 2v4H6zm2-2h1m6 0h1`,
  Dashboard: "M4 17a8 8 0 1 1 16 0zm8-1 4-5m-8 2h.01m4-4h.01",
};

export type PreviewCameraSelectProps<View extends string> = {
  views: readonly View[];
  view: View;
  onViewChange: (view: View) => void;
  label?: string;
  viewLabels?: Partial<Record<View, string>>;
  vertical?: boolean;
  allowReselect?: boolean;
};

export function PreviewCameraSelect<View extends string>({
  views, view, onViewChange, label = "Preview camera", viewLabels, vertical = false, allowReselect = false, showDriverIcon = false, children,
}: PreviewCameraSelectProps<View> & { showDriverIcon?: boolean; children?: ReactNode }) {
  return <div className="fitting-camera-select" role="group" aria-label={label}>
    <div className="fitting-camera-choices" role="group" aria-label="Views" data-controller-row data-controller-columns={vertical ? 1 : 7}>
      {views.map(item => {
        const name = viewLabels?.[item] ?? item;
        const icon = item === "Whole car" ? <MenuIcon name="vehicles" />
          : item === "Full body" && showDriverIcon ? <MenuIcon name="cockpit" />
          : <PreviewCameraChoiceIcon path={VIEW_ICONS[item] ?? FRAME} />;
        return <PreviewToolButton key={item} label={name} data-camera-choice={item}
          aria-pressed={view === item} onClick={() => { if (allowReselect || view !== item) onViewChange(item); }}>{icon}</PreviewToolButton>;
      })}
    </div>
    {children}
  </div>;
}
