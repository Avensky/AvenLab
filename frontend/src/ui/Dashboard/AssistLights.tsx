import { useInputStore } from "../../store/input/inputStore";
import { VehicleFlags, hasFlag } from "../../store/input/protocol/inputMasks";
import { ActionButton } from "../../controls/TouchControls";
import { unpackCockpit } from "../../store/input/protocol/cockpitMasks";

export function AssistLights({
  abs,
  tcs,
  live,
}: {
  abs: boolean;
  tcs: boolean;
  live: boolean;
}) {
  const requested = useInputStore((s) => s.input.vehicleMask);
  const cockpit = useInputStore((s) => s.input.cockpit_mask);
  const specialTcs =
    cockpit !== undefined && unpackCockpit(cockpit).assist !== 0;
  return (
    <div
      className="dashboard-assists"
      role="group"
      aria-label="Driving assists"
    >
      {(
        [
          ["ABS", abs, VehicleFlags.ABS, "Q"],
          ["TCS", tcs, VehicleFlags.TCS, "T"],
        ] as const
      ).map(([name, enabled, flag, key]) => (
        <ActionButton
          key={name}
          aria-label={`Toggle ${name}`}
          aria-pressed={enabled}
          disabled={!live}
          data-enabled={enabled}
          aria-busy={
            live &&
            !(name === "TCS" && specialTcs) &&
            hasFlag(requested, flag) !== enabled
          }
          title={`${name === "TCS" ? "Traction control" : "Anti-lock brakes"} · ${key}`}
          onClick={() =>
            name === "TCS" && specialTcs
              ? useInputStore.getState().setVehicleFlag(flag, !enabled)
              : useInputStore.getState().toggleVehicleFlag(flag)
          }
        >
          {name}
          <span>{enabled ? "ON" : "OFF"}</span>
        </ActionButton>
      ))}
    </div>
  );
}
