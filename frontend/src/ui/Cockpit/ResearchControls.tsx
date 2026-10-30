import { useInputStore } from "../../store/input/inputStore";
import { PlayerFlags, hasFlag } from "../../store/input/protocol/inputMasks";

/** Research-only instrumentation. Vehicle controls belong to their cockpit
 * pages and HUD; this component never duplicates light, assist or wash inputs. */
export function ResearchControls() {
  const player = useInputStore((s) => s.input.playerMask);
  return (
    <div className="console-command-grid">
      {(
        [
          [PlayerFlags.CANDUMP, "CAN LOG"],
          [PlayerFlags.LIVECAN, "LIVE CAN"],
          [PlayerFlags.DYNO, "DYNO"],
        ] as const
      ).map(([flag, label]) => (
        <button
          type="button"
          key={label}
          aria-pressed={hasFlag(player, flag)}
          onClick={() => useInputStore.getState().togglePlayerFlag(flag)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
