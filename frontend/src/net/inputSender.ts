import { useMotionView } from "../store/session/networkViews";
import {sampleTankFire,clearTankFireInputs} from '../combat/tankLoadout';
import {isMechanicPlayer} from '../combat/reviveTargets';
import {requestAssistedHealPack} from '../combat/healPackTargets';
import {canAimTurret,syncTurretOrientation} from "../combat/turretControls";
import { combatIntent,tankFireInputs,DEFAULT_MOUNT,useCombatStore } from "../combat/combatStore";
import { useNetworkStore } from "../store/session/networkStore";
import { useUIStore } from "../store/menus/uiStore";
import { inputRef, useInputStore } from "../store/input/inputStore";
import { useWorldStore } from "../store/world/worldStore";
import {
  socket,
  supportsPackedInput,
  inputSenderDiagnostics,
  recordInputPacketSent,
} from "./rustSocket";
import {encodePackedInput} from './packedInput';
import {InputSendGate} from './inputSendGate';
import {useDebugViewStore} from '../store/presentation/debugViewStore';
export { getInputSenderStats } from "./rustSocket";

let seq = 0;
let lastSendTime = performance.now();
let lastSocket: WebSocket | null = null;
let intervalId: number | null = null;
let stopSessionWatch: (()=>void)|null=null;
let rate = 60;
const sendGate = new InputSendGate();

function transmitInput(allowQueuedNeutral = false) {
  const connection = socket;
  if (!connection || connection.readyState !== WebSocket.OPEN) return;
  const now = performance.now();
  if (connection !== lastSocket) {
    lastSocket = connection;
    sendGate.reset();
    seq = 0;
    lastSendTime = now - 1000 / rate;
    inputSenderDiagnostics.sent = 0;
    inputSenderDiagnostics.skipped = 0;
  }
  // After queued bytes drain, read today's intent. Written bytes cannot be recalled.
  if (connection.bufferedAmount > 0 && !allowQueuedNeutral) {
    inputSenderDiagnostics.skipped++;
    return;
  }
  if (document.visibilityState === "hidden")
    useInputStore.getState().releaseControls();
  const dt = Math.max(0, Math.min((now - lastSendTime) / 1000, 0.1));
  const turretVehicle=useNetworkStore.getState().getMe();
  // Lobby/menu sockets still heartbeat, but have no driving mailbox to feed.
  if (!turretVehicle || turretVehicle.health?.defeated) {sendGate.reset();return;}
  syncTurretOrientation(turretVehicle.rotation);
  const mask=useWorldStore.getState().debugMask;
  const packet = {
    ...inputRef.current,
    combat: (()=>{
      const ui=useUIStore.getState(),me=turretVehicle,state=useCombatStore.getState();
      const enabled=combatIntent.enabled&&canAimTurret()&&document.visibilityState!=='hidden';
      const firing=me?.vehicle_id==='tank'?sampleTankFire(tankFireInputs,state.secondaryWeapon,now,me.combat?.cannon_reload):{
        weapon:combatIntent.weapon,
        fire:combatIntent.fire||combatIntent.keyboardFire||combatIntent.gamepadFire||combatIntent.directWeaponHeld===combatIntent.weapon||now<combatIntent.firePulseUntil,
      };
      // Older servers treat unknown weapon IDs as cannon. Never let a missing
      // basket capability turn an intended machine-gun request into a cannon.
      const supported=firing.weapon!=='basket'||me?.combat?.basket_reload!==undefined;
      const healer=isMechanicPlayer();
      // Primary support fire does not require turret enable/aim. It requests an
      // assisted projectile through the server adapter, never a damaging ray.
      if(healer&&firing.fire&&ui.overlay===null&&document.visibilityState!=='hidden')void requestAssistedHealPack();
      combatIntent.weapon=firing.weapon;
      // Device holds, debounce deadlines and scope state stay local.
      return {yaw:combatIntent.yaw,pitch:combatIntent.pitch,hull_locked:combatIntent.orientationLocked,
        lock_target:combatIntent.orientationLocked?combatIntent.lock_target:undefined,
        ram:ui.overlay===null&&(combatIntent.ram||combatIntent.gamepadRam||combatIntent.keyboardRam||now<combatIntent.ramPulseUntil),
        weapon:firing.weapon,fire:!healer&&supported&&enabled&&ui.overlay===null&&firing.fire,enabled,
        ...(state.mounts[me?.vehicle_id??'']??DEFAULT_MOUNT)};
    })(),
    type: "input" as const,
    seq,
    dt, // Transport timing only; Rust retains its fixed simulation timestep.
    debug_mask: mask && useDebugViewStore.getState().playerScope==='all' ? mask|128 : mask, // Single owner of debug requests.
  };
  const packed = supportsPackedInput(connection) ? encodePackedInput(packet) : null;
  if (packed && !allowQueuedNeutral && !sendGate.shouldSend(packed, now)) {
    inputSenderDiagnostics.skipped++;
    return;
  }
  connection.send(packed ?? JSON.stringify(packet));
  if (packed) sendGate.sent(packed, now);
  recordInputPacketSent(seq, now);
  seq = (seq + 1) >>> 0; // Rust seq is u32; increment only on actual sends.
  lastSendTime = now;
  inputSenderDiagnostics.sent++;
}

export function sendInputPacket() {
  transmitInput();
}

function releaseHeldControls() {
  clearTankFireInputs(tankFireInputs);
  useInputStore.getState().releaseControls();
  transmitInput(true);
}
function syncInputClock() {
  const me=useNetworkStore.getState().getMe();
  const active=!!me && !me.health?.defeated && document.visibilityState!=="hidden";
  if(active && intervalId===null) {
    sendGate.reset();
    intervalId=window.setInterval(sendInputPacket,1000/rate);
  } else if(!active && intervalId!==null) {
    window.clearInterval(intervalId);intervalId=null;sendGate.reset();
  }
  inputSenderDiagnostics.running=active;
}
function onVisibilityChange() {
  if (document.visibilityState === "hidden") releaseHeldControls();
  syncInputClock();
}

export function startInputSender(rateHz = 60) {
  if (!Number.isFinite(rateHz) || rateHz <= 0)
    throw new RangeError("Input rate must be positive and finite");
  stopInputSender(); // The app starts this loop; socket reconnect creates no second timer.
  rate = Math.min(rateHz, 240);
  lastSendTime = performance.now();
  window.addEventListener("blur", releaseHeldControls);
  document.addEventListener("visibilitychange", onVisibilityChange);
  stopSessionWatch=useMotionView.subscribe(syncInputClock);
  syncInputClock();
}

export function stopInputSender() {
  stopSessionWatch?.();stopSessionWatch=null;
  const wasRunning = intervalId !== null;
  if (intervalId !== null) window.clearInterval(intervalId);
  intervalId = null;
  inputSenderDiagnostics.running = false;
  window.removeEventListener("blur", releaseHeldControls);
  document.removeEventListener("visibilitychange", onVisibilityChange);
  clearTankFireInputs(tankFireInputs);
  useInputStore.getState().releaseControls();
  // One final neutral packet releases the server's last held input. This rare
  // teardown packet may queue behind existing bytes; no stopped loop can retry it.
  if (wasRunning) transmitInput(true);
}
if (import.meta.hot) import.meta.hot.dispose(stopInputSender);
