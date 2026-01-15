import type { InputPacket } from "../store/store";
import { THROTTLE_THRESHOLD, BRAKE_THRESHOLD } from "./constants";
import { VehicleFlags } from "../utils/inputMasks";

// ✅ PURE FUNCTION — NO HOOKS ALLOWED
export function deriveVehicleSignals(input: InputPacket) {
    const braking = input.brake > BRAKE_THRESHOLD;
    const accelerating = input.throttle > THROTTLE_THRESHOLD;
    const reversing = input.throttle < -THROTTLE_THRESHOLD;
    const coasting = !braking && !accelerating && !reversing;

    const absActive =
        (input.vehicleMask & VehicleFlags.ABS) !== 0;

    const tractionControl =
        (input.vehicleMask & VehicleFlags.TCS) !== 0;

    return {
        braking,
        accelerating,
        reversing,
        coasting,
        absActive,
        tractionControl,
    };
}
