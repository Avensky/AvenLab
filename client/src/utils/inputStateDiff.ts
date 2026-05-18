// import type { VehicleStateInput } from "../store/playerInput";
// type VehicleStateDiff = Partial<Omit<VehicleStateInput, "type">> & {
//   type: "vehicle_state";
// };

// export function inputStateDiff(
//   current: VehicleStateInput,
//   last: VehicleStateInput
// ): VehicleStateDiff | null {
//   const diff: VehicleStateDiff = { type: "vehicle_state" };
//   let changed = false;

//   for (const key of Object.keys(current) as (keyof VehicleStateInput)[]) {
//     if (key === "type") continue;

//     if (current[key] !== last[key]) {
//       (diff as any)[key] = current[key];
//       changed = true;
//     }

//   }

//   return changed ? diff : null;
// }

// let lastSentState: VehicleStateInput = {
//   type: "vehicle_state",
//   // initialize all fields here if needed
// };

// export function sendVehicleStateIfChanged(
//   socket: WebSocket,
//   currentState: VehicleStateInput
// ) {

//   const diff = inputStateDiff(currentState, lastSentState);

//   if (diff) {
//     socket.send(JSON.stringify(diff));
//     lastSentState = { ...lastSentState, ...diff };
//   }
// }
