// import { useEffect, useRef  } from 'react'
// // import { keys } from '../keys'
// // import { isControl, useStore } from '../store'
// // import type { BindableActionName } from '../store'
// // import socket from '../socket'
// import { useSnapshotStore } from "../store/store";
// import { VehicleFlags, PlayerFlags } from "../utils/inputMasks";

// export function Keyboard() {
//   // const binding = useStore((state) => state.booleans.binding)
//   // const actionInputMap = useStore((state) => state.actionInputMap)
//   // const actions = useStore((state) => state.actions)

//   const setInput = useSnapshotStore((s) => s.setInput);
//   // console.log(useSnapshotStore.getState().input);
//   // Track key state locally (prevents jitter)
//   const keys = useRef<Record<string, boolean>>({});

//   // useEffect(() => {
//   //   if (binding) return
//   //   const keyMap: Partial<Record<string, BindableActionName>> = keys(actionInputMap).reduce(
//   //     (out, actionName) => ({ ...out, ...actionInputMap[actionName].reduce((inputs, input) => ({ ...inputs, [input]: actionName }), {}) }),
//   //     {},
//   //   )
//   //   const downHandler = (e: KeyboardEvent) => {
//   //     const actionName = keyMap[e.key.toLowerCase()]
//   //     if (e.key.toLowerCase() === "r") {
//   //       socket.emit("controls", { reset: true });
//   //       return; // ⬅ prevent further processing for 'r'
//   //     }

//   //     if (!actionName || (e.target as HTMLElement).nodeName === 'INPUT' || !isControl(actionName)) return
//   //     actions[actionName](true)
//   //     socket.emit('controls', useStore.getState().controls)
//   //   }
//   //   const upHandler = (e: KeyboardEvent) => {
//   //     const actionName = keyMap[e.key.toLowerCase()]
//   //     if (!actionName || (e.target as HTMLElement).nodeName === 'INPUT') return
//   //     actions[actionName](false)
//   //     socket.emit('controls', useStore.getState().controls)
//   //   }

//   //   window.addEventListener('keydown', downHandler, { passive: true })
//   //   window.addEventListener('keyup', upHandler, { passive: true })

//   //   return () => {
//   //     window.removeEventListener('keydown', downHandler)
//   //     window.removeEventListener('keyup', upHandler)
//   //   }
//   // }, [actionInputMap, binding])

//   // return null

//   useEffect(() => {
//     const recomputeAxes = () => {
//         const k = keys.current;

//         let throttle = 0;
//         if (k["KeyW"]) throttle += 1;
//         if (k["KeyS"]) throttle -= 1;

//         let steer = 0;
//         if (k["KeyA"]) steer -= 1;
//         if (k["KeyD"]) steer += 1;

//         const brake = k["Space"] ? 1 : 0;

//         setInput({ throttle, steer, brake });
//     };

//     const toggleVehicleFlag = (flag: number) => {
//         const { input } = useSnapshotStore.getState();
//         const mask = input.vehicleMask ^ flag;
//         setInput({ vehicleMask: mask });
//     };

//     const togglePlayerFlag = (flag: number) => {
//         const { input } = useSnapshotStore.getState();
//         const mask = input.playerMask ^ flag;
//         setInput({ playerMask: mask });
//     };

//     const handleKeyDown = (e: KeyboardEvent) => {
//         if (e.repeat) return;
//         keys.current[e.code] = true;

//         switch (e.code) {
//           // --------------------
//           // Driving
//           // --------------------
//           case "KeyW":
//           case "KeyS":
//           case "KeyA":
//           case "KeyD":
//           case "Space":
//               recomputeAxes();
//               break;

//           // --------------------
//           // Vehicle toggles
//           // --------------------
//           case "KeyE":
//               toggleVehicleFlag(VehicleFlags.ENGINE_ON);
//               break;

//           case "KeyL":
//               toggleVehicleFlag(VehicleFlags.HEADLIGHTS);
//               break;

//           case "KeyQ":
//               toggleVehicleFlag(VehicleFlags.ABS);
//               break;

//           case "KeyT":
//               toggleVehicleFlag(VehicleFlags.TCS);
//               break;

//           // --------------------
//           // Player toggles
//           // --------------------
//           case "KeyR":
//               togglePlayerFlag(PlayerFlags.RESET);
//               break;

//           case "ShiftLeft":
//               togglePlayerFlag(PlayerFlags.BOOST);
//               break;
//           case "KeyB":
//               toggle(); // B = block boxes
//               break;

//         }
//     };

//     const handleKeyUp = (e: KeyboardEvent) => {
//         keys.current[e.code] = false;

//         switch (e.code) {
//           case "KeyW":
//           case "KeyS":
//           case "KeyA":
//           case "KeyD":
//           case "Space":
//               recomputeAxes();
//               break;
//         }
//     };

//     window.addEventListener("keydown", handleKeyDown);
//     window.addEventListener("keyup", handleKeyUp);

//     return () => {
//         window.removeEventListener("keydown", handleKeyDown);
//         window.removeEventListener("keyup", handleKeyUp);
//     };
//   }, [setInput]);
// }
