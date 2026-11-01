import { SelectorArrow } from "./SelectorArrow";
import { getSelectionClasses } from "../../components/menus/selectionStyles";
import { useSelectionStore, useUIStore } from "../../store";

type MapSelectorProps = {
  menuIndex?: number;
  menuId?: "sandbox_setup" | "signal_recon_setup";
  showName?: boolean;
  showDesc?: boolean;
  translucent?: boolean;
  formNavigation?: boolean;
  disabled?: boolean;
  onPrevious?: () => void;
  onNext?: () => void;
  title?: string;
  onConfirm?: () => void;
};

export function MapSelector({
  menuIndex = 1,
  menuId = "signal_recon_setup",
  showName = true,
  showDesc = true,
  translucent = false,
  formNavigation = false,
  disabled = false,
  onPrevious,
  onNext,
  title,
  onConfirm,
}: MapSelectorProps) {
  const map = useSelectionStore((s) => s.getSelectedMap());
  const previousMap = useSelectionStore((s) => s.prevMap);
  const nextMap = useSelectionStore((s) => s.nextMap);

  const selectedIndex = useUIStore((s) => s.selectedMenuIndexById[menuId]);
  const setActiveMenuIndex = useUIStore((s) => s.setActiveMenuIndex);

  const selected = !formNavigation && selectedIndex === menuIndex;

  return (
    <div
      className={`selection-strip border-t transition-[background,border-color,box-shadow] duration-200 ${getSelectionClasses(selected, translucent)}`}
      data-controller-selector={formNavigation || undefined}
      tabIndex={formNavigation && !disabled ? 0 : undefined}
      role={formNavigation ? "group" : undefined}
      aria-label={
        formNavigation ? `Environment: ${title ?? map.name}` : undefined
      }
      aria-disabled={disabled || undefined}
      onClick={(event) => {
        if (event.target === event.currentTarget && !disabled) onConfirm?.();
      }}
      onPointerEnter={() => {
        if (!formNavigation) setActiveMenuIndex(menuIndex);
      }}
      onFocusCapture={() => {
        if (!formNavigation) setActiveMenuIndex(menuIndex);
      }}
    >
      <div className="selection-strip-layout">
        <SelectorArrow
          formNavigation={formNavigation}
          disabled={disabled}
          variant={
            translucent
              ? "neutral"
              : menuId === "sandbox_setup"
                ? "selector"
                : "secondary"
          }
          direction="previous"
          label="Previous map"
          onPress={onPrevious ?? previousMap}
        />

        <div className="min-w-0 flex-1 text-center">
          <p className="selection-strip-label text-slate-400">ENVIRONMENT</p>
          {showName && (
            <h2
              className={`selection-strip-title truncate font-black transition-colors duration-200 ${
                selected || translucent ? "text-cyan-100" : "text-slate-500"
              }`}
            >
              {title ?? map.name}
            </h2>
          )}

          {showDesc && map.desc && (
            <p
              className={`selection-strip-meta truncate transition-colors duration-200 ${
                selected || translucent ? "text-slate-400" : "text-slate-600"
              }`}
            >
              {map.desc}
            </p>
          )}
        </div>

        <SelectorArrow
          formNavigation={formNavigation}
          disabled={disabled}
          variant={
            translucent
              ? "neutral"
              : menuId === "sandbox_setup"
                ? "selector"
                : "secondary"
          }
          direction="next"
          label="Next map"
          onPress={onNext ?? nextMap}
        />
      </div>
    </div>
  );
}
