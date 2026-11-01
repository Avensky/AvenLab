import { useMemo } from "react";
import { GameButton } from "../../../components/GameButton";
import {
  useCanBusStore,
  CAN_INTERFACE_OPTIONS,
  CAN_MODE_OPTIONS,
  type CanInterface,
  type CanMode,
} from "../../../store/recon/canBusStore";
import {
  cycleCanInterface,
  cycleCaptureMode,
} from "../../../store/recon/captureSetup";
import "./canCaptureSelectors.css";

/** Same store/actions as the original setup bars. Garage fields form one
 * horizontal row: Left/Right changes focus and A/Enter/click cycles a value. */
export function CanCaptureSelectors({
  formNavigation = false,
  selectedIndex = 0,
  onFocus,
  onChange,
  disabled = false,
}: {
  formNavigation?: boolean;
  selectedIndex?: number;
  onFocus?: (index: number) => void;
  onChange?: () => void;
  disabled?: boolean;
}) {
  const iface = useCanBusStore((s) => s.selectedInterface),
    mode = useCanBusStore((s) => s.selectedMode),
    status = useCanBusStore((s) => s.status);
  const health = status?.[iface]?.exists
    ? status[iface]?.up
      ? "UP"
      : "DOWN"
    : "UNAVAILABLE";
  return (
    <div
      className="can-capture-selectors"
      role="group"
      aria-label="CAN capture controls"
    >
      {[
        {
          label: "CAN interface",
          value: `${iface} · ${health}`,
          aria: `CAN interface: ${iface}`,
          action: cycleCanInterface,
        },
        {
          label: "Capture mode",
          value: mode,
          aria: `Capture mode: ${mode}`,
          action: cycleCaptureMode,
        },
      ].map((field, index) => {
        const copy = (
          <>
            <span className="can-selector-label">{field.label}</span>
            <span className="can-selector-value">{field.value}</span>
          </>
        );
        const change = () => {
          onFocus?.(index);
          field.action(1);
          onChange?.();
        };
        return formNavigation ? (
          <button
            key={field.label}
            type="button"
            className="menu-control can-capture-field"
            data-can-field={index}
            aria-label={field.aria}
            disabled={disabled}
            onClick={change}
            onKeyDown={(event) => {
              if (event.code === "Enter" || event.code === "Space")
                event.stopPropagation();
            }}
          >
            {copy}
          </button>
        ) : (
          <GameButton
            key={field.label}
            data-recon-choice={index}
            variant="neutral"
            selected={selectedIndex === index}
            disabled={disabled}
            onFocus={() => onFocus?.(index)}
            onPress={change}
            className="can-capture-field"
            aria-label={field.aria}
          >
            {copy}
          </GameButton>
        );
      })}
    </div>
  );
}

/** Workspace dropdowns retain their original compact labels and readiness list. */
export function CanCaptureDropdowns({
  disabled = false,
}: {
  disabled?: boolean;
}) {
  const iface = useCanBusStore((s) => s.selectedInterface),
    mode = useCanBusStore((s) => s.selectedMode),
    status = useCanBusStore((s) => s.status);
  const interfaces = useMemo(() => {
    if (!status) return [...CAN_INTERFACE_OPTIONS];
    const available = CAN_INTERFACE_OPTIONS.filter(
      (value) => status[value]?.exists || value === iface,
    );
    return available.length ? available : [...CAN_INTERFACE_OPTIONS];
  }, [status, iface]);
  return (
    <>
      <label className="flex h-4 min-w-0 items-center rounded-sm border border-cyan-400/25 bg-slate-950 px-1 py-0.5">
        <span className="mr-1 text-[8px] tracking-[0.18em] text-slate-500">
          IFACE
        </span>
        <select
          aria-label="CAN interface"
          value={iface}
          disabled={disabled}
          onChange={(event) =>
            useCanBusStore
              .getState()
              .setSelectedInterface(event.target.value as CanInterface)
          }
          className="min-w-0 bg-slate-950 font-mono text-[9px] font-bold uppercase text-green-100 outline-none disabled:opacity-40"
        >
          {interfaces.map((value) => (
            <option key={value} value={value}>
              {status?.[value]?.up === false ? `${value} · DOWN` : value}
            </option>
          ))}
        </select>
      </label>
      <label className="flex h-4 min-w-0 items-center rounded-sm border border-cyan-400/25 bg-slate-950 px-1 py-0.5">
        <span className="mr-1 text-[8px] tracking-[0.18em] text-slate-500">
          MODE
        </span>
        <select
          aria-label="Capture mode"
          value={mode}
          disabled={disabled}
          onChange={(event) =>
            useCanBusStore
              .getState()
              .setSelectedMode(event.target.value as CanMode)
          }
          className="min-w-0 bg-slate-950 font-mono text-[9px] font-bold text-green-100 outline-none disabled:opacity-40"
        >
          {CAN_MODE_OPTIONS.map((value) => (
            <option key={value} value={value}>
              {value.toUpperCase()}
            </option>
          ))}
        </select>
      </label>
    </>
  );
}
