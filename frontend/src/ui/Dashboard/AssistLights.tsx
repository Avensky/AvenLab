import { useInputStore } from "../../store/inputStore";
import { VehicleFlags, hasFlag } from "../../store/tools/inputMasks";
import { ActionButton } from "../../controls/TouchControls";

export function AssistLights({ abs, tcs, live }: { abs: boolean; tcs: boolean; live: boolean }) {
  const requested = useInputStore(s => s.input.vehicleMask);
  return <div className="dashboard-assists" role="group" aria-label="Driving assists">
    {([ ["ABS", abs, VehicleFlags.ABS, "Q"], ["TCS", tcs, VehicleFlags.TCS, "T"] ] as const).map(([name, enabled, flag, key]) =>
      <ActionButton key={name} aria-label={`Toggle ${name}`} aria-pressed={enabled} disabled={!live}
        data-enabled={enabled} aria-busy={live && hasFlag(requested, flag) !== enabled}
        title={`${name === "TCS" ? "Traction control" : "Anti-lock brakes"} · ${key}`}
        onClick={() => useInputStore.getState().toggleVehicleFlag(flag)}>{name}<span>{enabled ? "ON" : "OFF"}</span></ActionButton>)}
  </div>;
}
