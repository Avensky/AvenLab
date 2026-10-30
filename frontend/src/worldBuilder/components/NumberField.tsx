import { layoutAction } from "../state/layoutStore";
export function NumberField({
  label,
  value,
  step = 0.5,
  disabled = false,
  onCommit,
}: {
  label: string;
  value: number;
  step?: number;
  disabled?: boolean;
  onCommit: (value: number) => void;
}) {
  return (
    <div className="le-number">
      <label>
        <span>{label}</span>
        <input
          key={value}
          aria-label={label}
          type="number"
          disabled={disabled}
          step={step}
          defaultValue={Number(value.toFixed(4))}
          onBlur={(e) => {
            const v = Number(e.currentTarget.value);
            if (e.currentTarget.value.trim() && Number.isFinite(v)) {
              if (!layoutAction(() => onCommit(v)))
                e.currentTarget.value = String(value);
            } else e.currentTarget.value = String(value);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              e.currentTarget.blur();
            } else if (e.key === "Escape") {
              e.preventDefault();
              e.stopPropagation();
              e.currentTarget.value = String(value);
              e.currentTarget.blur();
            }
          }}
        />
      </label>
      <div className="le-step-buttons">
        <button
          disabled={disabled}
          aria-label={`Decrease ${label}`}
          onClick={() => layoutAction(() => onCommit(value - step))}
        >
          −
        </button>
        <button
          disabled={disabled}
          aria-label={`Increase ${label}`}
          onClick={() => layoutAction(() => onCommit(value + step))}
        >
          +
        </button>
      </div>
    </div>
  );
}
