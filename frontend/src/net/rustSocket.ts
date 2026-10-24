// One socket owner. Direct imports avoid loading models/UI/CAN via the store barrel.
import { useNetworkStore, type PhysicsSnapshot } from "../store/networkStore";
import { useInputStore } from "../store/inputStore";
import { useWorldStore, type MapSnapshot } from "../store/worldStore";

import { performanceRecorder as recorder } from "../performance/measurements";
const packetEncoder = new TextEncoder();

let socket: WebSocket | null = null;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectEnabled = false;
let pingSentMs: number | null = null;

// The input sender is the only writer; diagnostics are plain counters, not React state.
// Keeping them here lets the menu inspect transport without importing/starting a sender.
export const inputSenderDiagnostics = { running: false, sent: 0, skipped: 0 };
const pendingInputTimes = new Map<number, number>();
let acknowledgedInputSeq: number | null = null;
let inputAckMs: number | null = null;
export const packetDiagnostics = { snapshotChars: 0, debugChars: 0, decodeMs: 0, worstDecodeMs: 0 };

export function recordInputPacketSent(seq: number, sentMs: number) {
  pendingInputTimes.set(seq, sentMs);
  // Diagnostics must remain bounded even before spawning or during a stall.
  if (pendingInputTimes.size > 1024) pendingInputTimes.delete(pendingInputTimes.keys().next().value!);
}

function acknowledgeInput(seq: unknown, receivedMs: number) {
  if (typeof seq !== "number" || !Number.isInteger(seq) || seq < 0 || seq > 0xffffffff) return;
  const sentMs = pendingInputTimes.get(seq);
  if (sentMs === undefined) return; // Older servers or an untracked connection.
  acknowledgedInputSeq = seq;
  inputAckMs = Math.max(0, receivedMs - sentMs);
  recorder.record("inputAckMs", inputAckMs, receivedMs);
  // The newest held-state ack supersedes older packets, including dropped
  // intermediate intent. Delete by insertion order, which also handles u32 wrap.
  for (const pendingSeq of pendingInputTimes.keys()) {
    pendingInputTimes.delete(pendingSeq);
    if (pendingSeq === seq) break;
  }
}

export function getInputSenderStats() {
  const oldest = pendingInputTimes.values().next().value;
  return {
    ...inputSenderDiagnostics, queuedBytes: socket?.bufferedAmount ?? 0,
    acknowledgedInputSeq, inputAckMs, pendingInputs: pendingInputTimes.size,
    oldestPendingMs: oldest === undefined ? null : Math.max(0, performance.now() - oldest),
    ...packetDiagnostics,
  };
}

function getRustWsUrl() {
  if (import.meta.env.VITE_RUST_WS_URL) return import.meta.env.VITE_RUST_WS_URL;
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  // A remote browser must use the server hostname, not its own localhost.
  if (import.meta.env.DEV) {
    const url = new URL(window.location.href);
    url.protocol = protocol;
    url.port = "9001";
    url.pathname = "/";
    url.search = "";
    url.hash = "";
    return url.toString();
  }
  return `${protocol}//${window.location.host}/ws/`;
}

function clearTimers() {
  if (heartbeatTimer !== null) clearInterval(heartbeatTimer);
  if (reconnectTimer !== null) clearTimeout(reconnectTimer);
  heartbeatTimer = null;
  reconnectTimer = null;
  pingSentMs = null;
}

function clearSession() {
  pendingInputTimes.clear();
  acknowledgedInputSeq = inputAckMs = null;
  packetDiagnostics.snapshotChars = packetDiagnostics.debugChars = 0;
  packetDiagnostics.decodeMs = packetDiagnostics.worstDecodeMs = 0;
  useNetworkStore.getState().resetSession();
  useWorldStore.getState().setMap(null);
  useInputStore.getState().releaseControls();
}

function scheduleReconnect() {
  if (!reconnectEnabled || reconnectTimer !== null) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    if (reconnectEnabled) connectRustServer();
  }, 1000 + Math.random() * 2000);
}

function finiteTuple(value: unknown, length: number): boolean {
  return Array.isArray(value) && value.length === length &&
    value.every((component) => typeof component === "number" && Number.isFinite(component));
}

// Reject malformed transforms before they can reach Three. Optional timing stays compatible.
function isSnapshot(value: unknown): value is PhysicsSnapshot {
  if (!value || typeof value !== "object") return false;
  const snap = value as PhysicsSnapshot;
  return Number.isSafeInteger(snap.tick) && snap.tick >= 0 && Array.isArray(snap.entities) &&
    snap.entities.every((entity) => entity && typeof entity.id === "string" &&
      finiteTuple(entity.position, 3) && finiteTuple(entity.rotation, 4) &&
      (entity.wheels === undefined || (Array.isArray(entity.wheels) && entity.wheels.every((wheel) =>
        wheel && typeof wheel.id === "string" && finiteTuple(wheel.position, 3) && finiteTuple(wheel.rotation, 4))))) &&
    (snap.simulation_time_s === undefined || (Number.isFinite(snap.simulation_time_s) && snap.simulation_time_s >= 0)) &&
    (snap.tick_dt_s === undefined || (Number.isFinite(snap.tick_dt_s) && snap.tick_dt_s > 0));
}

export function connectRustServer(): WebSocket {
  reconnectEnabled = true;
  if (socket && (socket.readyState === WebSocket.CONNECTING || socket.readyState === WebSocket.OPEN)) return socket;
  clearTimers();
  clearSession();
  const connection = new WebSocket(getRustWsUrl());
  socket = connection;
  // Old callbacks cannot clear or close the replacement session.
  const isCurrent = () => socket === connection && reconnectEnabled;

  connection.onopen = () => {
    if (!isCurrent()) return;
    useNetworkStore.getState().setConnected(true);
    heartbeatTimer = setInterval(() => {
      if (!isCurrent() || connection.readyState !== WebSocket.OPEN || connection.bufferedAmount > 0) return;
      // Application pong has no timestamp, so allow one outstanding RTT measurement.
      if (pingSentMs !== null) return;
      pingSentMs = performance.now();
      connection.send(JSON.stringify({ type: "ping" }));
    }, 5000);
  };

  connection.onclose = () => {
    if (!isCurrent()) return;
    clearTimers();
    socket = null;
    clearSession();
    scheduleReconnect();
  };

  connection.onerror = () => {
    if (!isCurrent()) return;
    // Only the close handler owns cleanup and retries.
    connection.close();
  };

  connection.onmessage = (event) => {
    if (!isCurrent()) return;
    const receivedMs = performance.now();
    let message;
    try { message = JSON.parse(event.data); }
    catch { console.warn("Invalid JSON from Rust server"); return; }
    if (!message || typeof message !== "object") return;
    packetDiagnostics.decodeMs = Math.max(0, performance.now() - receivedMs);
    packetDiagnostics.worstDecodeMs = Math.max(packetDiagnostics.worstDecodeMs, packetDiagnostics.decodeMs);
    if (recorder.enabled || recorder.capturing) recorder.packet(message.type, packetEncoder.encode(event.data).byteLength, packetDiagnostics.decodeMs, receivedMs);
    const state = useNetworkStore.getState();
    switch (message.type) {
      case "pong":
        if (pingSentMs !== null) {
          state.setPingMs(receivedMs - pingSentMs);
          recorder.record("rttMs", receivedMs - pingSentMs, receivedMs);
        }
        pingSentMs = null;
        return;
      case "welcome":
        if (typeof message.player_id !== "string") return;
        state.setPlayerId(message.player_id);
        useNetworkStore.setState({
          team: message.team === "red" ? "red" : "blue",
          room_id: Number.isSafeInteger(message.room_id) ? message.room_id : null,
          spawn: finiteTuple(message.spawn, 3) ? message.spawn : null,
        });
        return;
      case "snapshot":
        // Preserve simulation_time_s/tick_dt_s instead of rebuilding tick/entities only.
        if (isSnapshot(message.data)) {
          packetDiagnostics.snapshotChars = typeof event.data === "string" ? event.data.length : 0;
          const previousReceipt = state.snapshot?.received_at_ms;
          if (previousReceipt !== undefined) recorder.record("arrivalMs", receivedMs - previousReceipt, receivedMs);
          recorder.record("serverLockMs", message.data.server_timing?.lock_ms, receivedMs);
          recorder.record("serverPhysicsMs", message.data.server_timing?.physics_ms, receivedMs);
          recorder.record("serverWorkMs", message.data.server_timing?.work_ms, receivedMs);
          state.setSnapshot(message.data, receivedMs);
          const me = message.data.entities.find((entity: PhysicsSnapshot["entities"][number]) => entity.id === state.playerId);
          acknowledgeInput(me?.last_input_seq, performance.now());
        }
        return;
      case "map_snapshot": {
        const map = message.data as MapSnapshot | undefined;
        if (map && Array.isArray(map.chunks) && Array.isArray(map.visuals)) {
          useWorldStore.getState().setMap(map);
        }
        return;
      }
      case "physics":
        // Legacy fallback; networkStore ignores this once snapshot telemetry is available.
        if (message.data) state.setPhysicsData(message.data);
        return;
      case "debug":
        packetDiagnostics.debugChars = typeof event.data === "string" ? event.data.length : 0;
        if (message.data && Array.isArray(message.data.wheels) && Array.isArray(message.data.chassis)) {
          state.setDebugOverlay(message.data, message.tick);
        }
        return;
      // Existing addEventListener consumers still receive these setup events.
      case "vehicle_config":
      case "spawn_ok":
      case "spawn_ready":
      case "spawn_error":
        return;
      default:
        console.warn("Unknown Rust message type:", message.type);
    }
  };
  return connection;
}

// App teardown must cancel retry timers as well as closing the live connection.
export function disconnectRustServer() {
  reconnectEnabled = false;
  clearTimers();
  const previous = socket;
  socket = null; // Invalidate callbacks before close can dispatch an event.
  previous?.close();
  clearSession();
}

if (import.meta.hot) import.meta.hot.dispose(disconnectRustServer);
export { socket };
