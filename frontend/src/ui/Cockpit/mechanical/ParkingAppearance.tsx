import { usePreferencesStore } from "../../../store/preferences/index";

/** Appearance is a cockpit/device preference. It never repairs, releases or
 * changes brake force; both visual styles use the same parking/drift commands. */
export function ParkingAppearance() {
  const style = usePreferencesStore((s) => s.parkingBrakeStyle),
    crystals = usePreferencesStore((s) => s.parkingCrystals);
  return (
    <fieldset className="parking-appearance">
      <legend>PARKING BRAKE</legend>
      <div role="group" aria-label="Parking brake appearance">
        {(["lever", "button"] as const).map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={style === value}
            onClick={() =>
              usePreferencesStore
                .getState()
                .update({ parkingBrakeStyle: value })
            }
          >
            {value === "lever" ? "REALISTIC LEVER" : "SIMPLE BUTTON"}
          </button>
        ))}
        <button
          type="button"
          role="switch"
          aria-label="Parking brake crystals"
          aria-checked={crystals}
          onClick={() =>
            usePreferencesStore
              .getState()
              .update({ parkingCrystals: !crystals })
          }
        >
          CRYSTALS: {crystals ? "SHOW" : "HIDE"}
        </button>
      </div>
    </fieldset>
  );
}
