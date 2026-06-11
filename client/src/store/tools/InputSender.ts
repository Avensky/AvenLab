import { inputRef } from "../inputStore";
import { useWorldStore } from "../worldStore";
import { socket } from "../../net/rustSocket";

let seq = 0;
let lastSendTime = performance.now();
let intervalId: number | null = null;

function sendInputPacket() {
  if (!socket || socket.readyState !== WebSocket.OPEN) return;

  const now = performance.now();
  const dt = Math.min((now - lastSendTime) / 1000, 0.1);
  lastSendTime = now;

  const input = inputRef.current;
  const debugMask = useWorldStore.getState().debugMask;

  const packet = {
    ...input,
    seq: seq++,
    dt,
    debug_mask: debugMask,
  };

  console.log("[send input]", packet.throttle, packet.steer, packet.brake);

  socket.send(JSON.stringify(packet));
}

export function startInputSender(rateHz = 60) {
  stopInputSender();

  lastSendTime = performance.now();

  const intervalMs = 1000 / rateHz;

  intervalId = window.setInterval(() => {
    sendInputPacket();
  }, intervalMs);
}

export function stopInputSender() {
  if (intervalId !== null) {
    window.clearInterval(intervalId);
    intervalId = null;
  }
}