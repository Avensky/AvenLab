import { useInputStore } from "../../store/input/inputStore";
import { unpackCabin } from "../../store/input/protocol/cabinMasks";
import {
  cockpitStatus,
  unpackCockpit,
} from "../../store/input/protocol/cockpitMasks";
import { useVehicleTelemetryStore } from "../../store/telemetry/vehicleTelemetryStore";

export function useCabinState() {
  const cabinMask = useVehicleTelemetryStore((s) => s.data.cabinMask);
  const version = useVehicleTelemetryStore((s) => s.data.config.cockpitVersion);
  const live = useVehicleTelemetryStore((s) => s.data.signal === "live");
  const request = useInputStore((s) => s.input.cabin_mask);
  return {
    live, version, extended: live && version >= 3, climate: live && version >= 5,
    cabinMask,
    cabin: unpackCabin(request ?? cabinMask ?? undefined),
    confirmedCabin: unpackCabin(cabinMask ?? undefined),
    cabinPending: request !== undefined &&
      (cabinMask === null || (request & 0xf03ff) !== (cabinMask & 0xf03ff)),
  };
}

export function useCockpitState() {
  const cabin = useCabinState();
  const { live, version } = cabin;
  const confirmedMask = useVehicleTelemetryStore((s) => s.data.cockpitMask);
  const actualGear = useVehicleTelemetryStore((s) => s.data.gear);
  const parkingConfirmed = useVehicleTelemetryStore(
    (s) => s.data.parkingFraction,
  );
  const parkingRequested = useInputStore((s) => s.input.parking_brake);
  const tcs = useVehicleTelemetryStore((s) => s.data.tcsEnabled);
  const request = useInputStore((s) => s.input.cockpit_mask);
  const confirmed = unpackCockpit(confirmedMask ?? undefined),
    requested = unpackCockpit(request ?? undefined);
  const pending =
    request !== undefined &&
    (confirmedMask === null || requested.revision !== confirmed.revision);
  return {
    ...cabin,
    confirmed,
    current: pending ? requested : confirmed,
    pending,
    parkingFraction:
      pending && parkingRequested !== undefined
        ? parkingRequested
        : (parkingConfirmed ?? confirmed.parkingStrength / 3),
    progressive: live && version >= 7,
    actualGear,
    status: cockpitStatus(confirmedMask),
    supported: live && version >= 2,
    drivetrain: live && version >= 4,
    tcs,
  };
}
