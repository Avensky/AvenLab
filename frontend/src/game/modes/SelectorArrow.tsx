import { GameButton } from "../../components/GameButton";

/** Legacy setup rows retain their menu-index owner. The shared garage form
 * uses native buttons so D-pad navigation and A activation have one owner. */
export function SelectorArrow({
  formNavigation,
  disabled = false,
  direction,
  label,
  onPress,
  variant,
}: {
  formNavigation: boolean;
  disabled?: boolean;
  direction: "previous" | "next";
  label: string;
  onPress: () => void;
  variant: "neutral" | "selector" | "secondary";
}) {
  const glyph = (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
      <path d={direction === "previous" ? "M9 1 2 6l7 5z" : "M3 1l7 5-7 5z"} />
    </svg>
  );
  return formNavigation ? (
    <button
      type="button"
      className="menu-control selection-strip-arrow"
      aria-label={label}
      data-selector-direction={direction}
      disabled={disabled}
      tabIndex={-1}
      onPointerDown={(event) => event.preventDefault()}
      onClick={(event) => {
        event.currentTarget.closest<HTMLElement>("[data-controller-selector]")?.focus({ preventScroll: true });
        onPress();
      }}
    >
      {glyph}
    </button>
  ) : (
    <GameButton
      variant={variant}
      disabled={disabled}
      onPress={onPress}
      className="selection-strip-arrow"
      aria-label={label}
    >
      {glyph}
    </GameButton>
  );
}
