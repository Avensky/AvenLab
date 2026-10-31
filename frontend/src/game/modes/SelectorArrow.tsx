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
  const glyph = direction === "previous" ? "◀" : "▶";
  return formNavigation ? (
    <button
      type="button"
      className="menu-control selection-strip-arrow"
      aria-label={label}
      data-selector-direction={direction}
      disabled={disabled}
      onClick={onPress}
      onKeyDown={(event) => {
        if (event.code === "Enter" || event.code === "Space")
          event.stopPropagation();
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
