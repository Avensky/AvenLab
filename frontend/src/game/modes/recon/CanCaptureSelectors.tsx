import { useMemo } from "react";
import { SelectorArrow } from "../SelectorArrow";
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

/** The garage's second tab rail uses LT/RT to choose its active field.
 * Left/Right edits that field; A belongs to the screen's primary action.
 * Legacy setup keeps its original GameButton owner. */
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
            <span className="can-selector-label selection-strip-label">
              {field.label}
            </span>
            <span className="can-selector-value selection-strip-title">
              {field.value}
            </span>
          </>
        );
        const change = () => {
          onFocus?.(index);
          field.action(1);
          onChange?.();
        };
        return formNavigation ? (
          <div
            key={field.label}
            className="selection-strip can-capture-field"
            data-can-field={index}
            data-active={selectedIndex === index}
            data-controller-selector
            tabIndex={-1}
            aria-current={selectedIndex === index ? "true" : undefined}
            role="group"
            aria-label={field.aria}
            aria-disabled={disabled}
            onPointerDownCapture={() => onFocus?.(index)}
            onFocusCapture={() => onFocus?.(index)}
            onClick={() => onFocus?.(index)}
          >
            <div className="selection-strip-layout">
              <SelectorArrow
                formNavigation
                disabled={disabled}
                direction="previous"
                label={`Previous ${field.label.toLowerCase()}`}
                variant="neutral"
                onPress={() => {
                  onFocus?.(index);
                  field.action(-1);
                  onChange?.();
                }}
              />
              <div className="can-selector-copy">{copy}</div>
              <SelectorArrow
                formNavigation
                disabled={disabled}
                direction="next"
                label={`Next ${field.label.toLowerCase()}`}
                variant="neutral"
                onPress={() => {
                  onFocus?.(index);
                  field.action(1);
                  onChange?.();
                }}
              />
            </div>
          </div>
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
