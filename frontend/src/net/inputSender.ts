import { inputRef, useInputStore } from "../store/input/inputStore";
import { useWorldStore } from "../store/world/worldStore";
import {
  socket,
  inputSenderDiagnostics,
  recordInputPacketSent,
} from "./rustSocket";
export { getInputSenderStats } from "./rustSocket";

let seq = 0;
let lastSendTime = performance.now();
let lastSocket: WebSocket | null = null;
let intervalId: number | null = null;
let rate = 60;

function transmitInput(allowQueuedNeutral = false) {
  const connection = socket;
  if (!connection || connection.readyState !== WebSocket.OPEN) return;
  const now = performance.now();
  if (connection !== lastSocket) {
    lastSocket = connection;
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
  const packet = {
    ...inputRef.current,
    type: "input",
    seq,
    dt, // Transport timing only; Rust retains its fixed simulation timestep.
    debug_mask: useWorldStore.getState().debugMask, // Single owner of debug requests.
  };
  connection.send(JSON.stringify(packet));
  recordInputPacketSent(seq, now);
  seq = (seq + 1) >>> 0; // Rust seq is u32; increment only on actual sends.
  lastSendTime = now;
  inputSenderDiagnostics.sent++;
}

export function sendInputPacket() {
  transmitInput();
}

function releaseHeldControls() {
  useInputStore.getState().releaseControls();
  sendInputPacket();
}
function onVisibilityChange() {
  if (document.visibilityState === "hidden") releaseHeldControls();
}

export function startInputSender(rateHz = 60) {
  if (!Number.isFinite(rateHz) || rateHz <= 0)
    throw new RangeError("Input rate must be positive and finite");
  stopInputSender(); // The app starts this loop; socket reconnect creates no second timer.
  rate = Math.min(rateHz, 240);
  lastSendTime = performance.now();
  window.addEventListener("blur", releaseHeldControls);
  document.addEventListener("visibilitychange", onVisibilityChange);
  intervalId = window.setInterval(sendInputPacket, 1000 / rate);
  inputSenderDiagnostics.running = true;
}

export function stopInputSender() {
  const wasRunning = intervalId !== null;
  if (intervalId !== null) window.clearInterval(intervalId);
  intervalId = null;
  inputSenderDiagnostics.running = false;
  window.removeEventListener("blur", releaseHeldControls);
  document.removeEventListener("visibilitychange", onVisibilityChange);
  useInputStore.getState().releaseControls();
  // One final neutral packet releases the server's last held input. This rare
  // teardown packet may queue behind existing bytes; no stopped loop can retry it.
  if (wasRunning) transmitInput(true);
}
if (import.meta.hot) import.meta.hot.dispose(stopInputSender);
