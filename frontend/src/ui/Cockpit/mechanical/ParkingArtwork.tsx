import type { Ref } from "react";
import { usePreferencesStore } from "../../../store/preferences/index";

/** Optional crystal presets. The realistic default has no numbered controls;
 * hiding the crystals never changes the latch or the drift force. */
export function ParkingDetents({
  strength,
  disabled,
  onSelect,
}: {
  strength: number;
  disabled: boolean;
  onSelect: (level: number) => void;
}) {
  const crystals = usePreferencesStore((s) => s.parkingCrystals);
  if (!crystals) return null;
  return (
    <div
      className="parking-levels"
      role="group"
      aria-label="Parking brake levels"
    >
      {[3, 2, 1].map((level) => (
        <button
          type="button"
          key={level}
          data-level={level}
          disabled={disabled}
          aria-label={`Parking brake ${Math.round((level / 3) * 100)} percent`}
          title={`Parking brake ${Math.round((level / 3) * 100)} percent`}
          aria-pressed={Math.abs(strength - level) < 0.002}
          data-filled={strength >= level - 0.002}
          onClick={() => onSelect(level)}
        >
          <svg
            className="parking-crystal"
            viewBox="0 0 12 16"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <path
              d="M6 0L11.5 3 11.5 13 6 16 .5 13 .5 3Z"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
        </button>
      ))}
    </div>
  );
}

/** Both artworks live in one input button. CSS picks a realistic stitched grip
 * or a simple P switch; drag preview still uses the same optional handle ref. */
export function ParkingLeverArtwork({
  handleRef,
}: {
  handleRef?: Ref<HTMLSpanElement>;
}) {
  return (
    <>
      <svg
        className="parking-simple-face"
        viewBox="0 0 60 60"
        aria-hidden="true"
      >
        <circle cx="30" cy="30" r="23" />
        <circle className="parking-simple-travel" cx="30" cy="30" r="23" />
        <path d="M23 43V17h9c14 0 14 16 0 16h-9m-9-17c-8 9-8 20 0 29m32-29c8 9 8 20 0 29" />
      </svg>
      <span className="ebrake-floor" />
      <span className="ebrake-base">
        <svg viewBox="0 0 80 30" aria-hidden="true">
          <ellipse cx="40" cy="20" rx="34" ry="8" />
          <path d="M14 19 28 9H49L68 19 60 23H22Z" />
          <path d="M27 12 34 22m4-12 3 13m5-12 8 10" />
        </svg>
      </span>
      <span className="ebrake-handle" ref={handleRef}>
        <svg viewBox="0 0 100 20" preserveAspectRatio="none" aria-hidden="true">
          <path d="M1 6 18 4 30 2H91Q99 2 99 10T91 18H30L18 16H1Z" />
          <path className="parking-grip" d="M33 3H88Q94 3 94 10T88 17H33Z" />
          <path className="parking-stitch" d="M35 7H89" />
        </svg>
      </span>
    </>
  );
}
