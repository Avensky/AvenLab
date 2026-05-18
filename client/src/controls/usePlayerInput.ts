// import { useEffect, useRef } from "react";
// import { useSnapshotStore } from "../store/store";
// import { VehicleFlags, PlayerFlags } from "../utils/inputMasks";

// export function usePlayerInput() {
//     const setInput = useSnapshotStore((s) => s.setInput);
//     // console.log(useSnapshotStore.getState().input);

//     // Track key state locally (prevents jitter)
//     const keys = useRef<Record<string, boolean>>({});

//     useEffect(() => {

//         const recomputeAxes = () => {
//             const k = keys.current;

//             let throttle = 0;
//             if (k["KeyW"]) throttle += 1;
//             if (k["KeyS"]) throttle -= 1;

//             let steer = 0;
//             if (k["KeyA"]) steer -= 1;
//             if (k["KeyD"]) steer += 1;

//             const brake = k["Space"] ? 1 : 0;

//             setInput({ throttle, steer, brake });
//         };

//         const toggleVehicleFlag = (flag: number) => {
//             const { input } = useSnapshotStore.getState();
//             const mask = input.vehicleMask ^ flag;
//             setInput({ vehicleMask: mask });
//         };

//         const togglePlayerFlag = (flag: number) => {
//             const { input } = useSnapshotStore.getState();
//             const mask = input.playerMask ^ flag;
//             setInput({ playerMask: mask });
//         };

//         const handleKeyDown = (e: KeyboardEvent) => {
//             if (e.repeat) return;
//             keys.current[e.code] = true;

//             switch (e.code) {
//                 // --------------------
//                 // Driving
//                 // --------------------
//                 case "KeyW":
//                 case "KeyS":
//                 case "KeyA":
//                 case "KeyD":
//                 case "Space":
//                     recomputeAxes();
//                     break;

//                 // --------------------
//                 // Vehicle toggles
//                 // --------------------
//                 case "KeyE":
//                     toggleVehicleFlag(VehicleFlags.ENGINE_ON);
//                     break;

//                 case "KeyL":
//                     toggleVehicleFlag(VehicleFlags.HEADLIGHTS);
//                     break;

//                 case "KeyQ":
//                     toggleVehicleFlag(VehicleFlags.ABS);
//                     break;

//                 case "KeyT":
//                     toggleVehicleFlag(VehicleFlags.TCS);
//                     break;

//                 // --------------------
//                 // Player toggles
//                 // --------------------
//                 case "KeyR":
//                     togglePlayerFlag(PlayerFlags.RESET);
//                     break;

//                 case "ShiftLeft":
//                     togglePlayerFlag(PlayerFlags.BOOST);
//                     break;
//             }
//         };

//         const handleKeyUp = (e: KeyboardEvent) => {
//             keys.current[e.code] = false;

//             switch (e.code) {
//                 case "KeyW":
//                 case "KeyS":
//                 case "KeyA":
//                 case "KeyD":
//                 case "Space":
//                     recomputeAxes();
//                     break;
//             }
//         };

//         window.addEventListener("keydown", handleKeyDown);
//         window.addEventListener("keyup", handleKeyUp);

//         return () => {
//             window.removeEventListener("keydown", handleKeyDown);
//             window.removeEventListener("keyup", handleKeyUp);
//         };
//     }, [setInput]);
// }
