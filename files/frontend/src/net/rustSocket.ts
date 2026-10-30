// One socket owner. Direct imports avoid loading models/UI/CAN via the store barrel.
import {
  useNetworkStore,
  type PhysicsSnapshot,
} from "../store/session/networkStore";
import { useInputStore } from "../store/input/inputStore";
import { useWorldStore, type MapSnapshot } from "../store/world/worldStore";
import { useVehicleConfigStore } from "../store/session/vehicleConfigStore";

import { performanceRecorder as recorder } from "../performance/measurements";
import { handlingSample } from "../performance/handling";
const packetEncoder = new TextEncoder();

let socket: WebSocket | null = null;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectEnabled = false;
let pingSentMs: number | null = null;
let vehicleChangeSequence = 0;

export function requestVehicleChange(vehicle: string): Promise<void> {
  const connection = socket;
  if (!connection || connection.readyState !== WebSocket.OPEN) {
    return Promise.reject(
      new Error("Connect to the game server before changing vehicles."),
    );
  }
  const requestId = `vehicle-${++vehicleChangeSequence}`;
  return new Promise((resolve, reject) => {
    const finish = (error?: Error) => {
      clearTimeout(timeout);
      connection.removeEventListener("message", onMessage);
      connection.removeEventListener("close", onClose);
      if (error) reject(error);
      else resolve();
    };
    const onMessage = (event: MessageEvent) => {
      let message;
      try {
        message = JSON.parse(event.data);
      } catch {
        return;
      }
      if (message?.request_id !== requestId) return;
      if (message.type === "vehicle_changed" && message.vehicle === vehicle)
        finish();
      else if (message.type === "vehicle_change_error")
        finish(new Error(message.message || "Unable to change vehicles."));
    };
    const onClose = () =>
      finish(
        new Error(
          "The game-server connection closed before the vehicle change completed.",
        ),
      );
    const timeout = setTimeout(
      () =>
        finish(
          new Error(
            "The server did not confirm the vehicle change. Try again.",
          ),
        ),
      5000,
    );
    connection.addEventListener("message", onMessage);
    connection.addEventListener("close", onClose);
    try {
      connection.send(
        JSON.stringify({
          type: "change_vehicle_request",
          vehicle,
          request_id: requestId,
        }),
      );
    } catch (error) {
      finish(
        error instanceof Error
          ? error
          : new Error("Unable to send the vehicle change."),
      );
    }
  });
}

export function requestSandboxService(): Promise<void> {
  const connection = socket;
  if (!connection || connection.readyState !== WebSocket.OPEN)
    return Promise.reject(
      new Error("Connect to the game server before servicing."),
    );
  const requestId = `service-${++vehicleChangeSequence}`;
  return new Promise((resolve, reject) => {
    const finish = (error?: Error) => {
      clearTimeout(timeout);
      connection.removeEventListener("message", onMessage);
      connection.removeEventListener("close", onClose);
      if (error) reject(error);
      else resolve();
    };
    const onMessage = (event: MessageEvent) => {
      let message;
      try {
        message = JSON.parse(event.data);
      } catch {
        return;
      }
      if (message?.request_id !== requestId) return;
      if (message.type === "vehicle_serviced") finish();
      else if (message.type === "vehicle_service_error")
        finish(new Error(message.message || "Unable to service vehicle."));
    };
    const onClose = () =>
      finish(new Error("Connection closed before service completed."));
    const timeout = setTimeout(
      () =>
        finish(
          new Error(
            "The server did not confirm service. Rebuild/restart the updated Rust backend.",
          ),
        ),
      5000,
    );
    connection.addEventListener("message", onMessage);
    connection.addEventListener("close", onClose);
    try {
      connection.send(
        JSON.stringify({
          type: "service_vehicle_request",
          request_id: requestId,
        }),
      );
    } catch (error) {
      finish(
        error instanceof Error
          ? error
          : new Error("Unable to send service request."),
      );
    }
  });
}

// The input sender is the only writer; diagnostics are plain counters, not React state.
// Keeping them here lets the menu inspect transport without importing/starting a sender.
export const inputSenderDiagnostics = { running: false, sent: 0, skipped: 0 };
const pendingInputTimes = new Map<number, number>();
let acknowledgedInputSeq: number | null = null;
let inputAckMs: number | null = null;
export const packetDiagnostics = {
  snapshotChars: 0,
  debugChars: 0,
  decodeMs: 0,
  worstDecodeMs: 0,
};

export function recordInputPacketSent(seq: number, sentMs: number) {
  pendingInputTimes.set(seq, sentMs);
  // Diagnostics must remain bounded even before spawning or during a stall.
  if (pendingInputTimes.size > 1024)
    pendingInputTimes.delete(pendingInputTimes.keys().next().value!);
}

function acknowledgeInput(seq: unknown, receivedMs: number) {
  if (
    typeof seq !== "number" ||
    !Number.isInteger(seq) ||
    seq < 0 ||
    seq > 0xffffffff
  )
    return;
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
    ...inputSenderDiagnostics,
    queuedBytes: socket?.bufferedAmount ?? 0,
    acknowledgedInputSeq,
    inputAckMs,
    pendingInputs: pendingInputTimes.size,
    oldestPendingMs:
      oldest === undefined ? null : Math.max(0, performance.now() - oldest),
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
  useVehicleConfigStore.getState().reset();
  useWorldStore.getState().setMap(null);
  useInputStore.getState().releaseControls();
}

function scheduleReconnect() {
  if (!reconnectEnabled || reconnectTimer !== null) return;
  reconnectTimer = setTimeout(
    () => {
      reconnectTimer = null;
      if (reconnectEnabled) connectRustServer();
    },
    1000 + Math.random() * 2000,
  );
}

function finiteTuple(value: unknown, length: number): boolean {
  return (
    Array.isArray(value) &&
    value.length === length &&
    value.every(
      (component) =>
        typeof component === "number" && Number.isFinite(component),
    )
  );
}

// Reject malformed transforms before they can reach Three. Optional timing stays compatible.
function isSnapshot(value: unknown): value is PhysicsSnapshot {
  if (!value || typeof value !== "object") return false;
  const snap = value as PhysicsSnapshot;
  return (
    Number.isSafeInteger(snap.tick) &&
    snap.tick >= 0 &&
    Array.isArray(snap.entities) &&
    snap.entities.every(
      (entity) =>
        entity &&
        typeof entity.id === "string" &&
        finiteTuple(entity.position, 3) &&
        finiteTuple(entity.rotation, 4) &&
        (entity.wheels === undefined ||
          (Array.isArray(entity.wheels) &&
            entity.wheels.every(
              (wheel) =>
                wheel &&
                typeof wheel.id === "string" &&
                finiteTuple(wheel.position, 3) &&
                finiteTuple(wheel.rotation, 4),
            ))),
    ) &&
    (snap.simulation_time_s === undefined ||
      (Number.isFinite(snap.simulation_time_s) &&
        snap.simulation_time_s >= 0)) &&
    (snap.tick_dt_s === undefined ||
      (Number.isFinite(snap.tick_dt_s) && snap.tick_dt_s > 0))
  );
}

export function connectRustServer(): WebSocket {
  reconnectEnabled = true;
  if (
    socket &&
    (socket.readyState === WebSocket.CONNECTING ||
      socket.readyState === WebSocket.OPEN)
  )
    return socket;
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
      if (
        !isCurrent() ||
        connection.readyState !== WebSocket.OPEN ||
        connection.bufferedAmount > 0
      )
        return;
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
    try {
      message = JSON.parse(event.data);
    } catch {
      console.warn("Invalid JSON from Rust server");
      return;
    }
    if (!message || typeof message !== "object") return;
    packetDiagnostics.decodeMs = Math.max(0, performance.now() - receivedMs);
    packetDiagnostics.worstDecodeMs = Math.max(
      packetDiagnostics.worstDecodeMs,
      packetDiagnostics.decodeMs,
    );
    if (recorder.enabled || recorder.capturing)
      recorder.packet(
        message.type,
        packetEncoder.encode(event.data).byteLength,
        packetDiagnostics.decodeMs,
        receivedMs,
      );
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
          room_id: Number.isSafeInteger(message.room_id)
            ? message.room_id
            : null,
          spawn: finiteTuple(message.spawn, 3) ? message.spawn : null,
        });
        return;
      case "snapshot":
        // Preserve simulation_time_s/tick_dt_s instead of rebuilding tick/entities only.
        if (isSnapshot(message.data)) {
          packetDiagnostics.snapshotChars =
            typeof event.data === "string" ? event.data.length : 0;
          const previousReceipt = state.snapshot?.received_at_ms;
          if (previousReceipt !== undefined)
            recorder.record(
              "arrivalMs",
              receivedMs - previousReceipt,
              receivedMs,
            );
          recorder.record(
            "serverLockMs",
            message.data.server_timing?.lock_ms,
            receivedMs,
          );
          recorder.record(
            "serverPhysicsMs",
            message.data.server_timing?.physics_ms,
            receivedMs,
          );
          recorder.record(
            "serverWorkMs",
            message.data.server_timing?.work_ms,
            receivedMs,
          );
          state.setSnapshot(message.data, receivedMs);
          const me = message.data.entities.find(
            (entity: PhysicsSnapshot["entities"][number]) =>
              entity.id === state.playerId,
          );
          if (recorder.enabled || recorder.capturing) {
            const handling = handlingSample(me);
            recorder.record("bodyRollDeg", handling.bodyRollDeg, receivedMs);
            recorder.record(
              "airborneWheels",
              handling.airborneWheels,
              receivedMs,
            );
          }
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
        packetDiagnostics.debugChars =
          typeof event.data === "string" ? event.data.length : 0;
        if (
          message.data &&
          Array.isArray(message.data.wheels) &&
          Array.isArray(message.data.chassis)
        ) {
          state.setDebugOverlay(message.data, message.tick);
        }
        return;
      // Existing addEventListener consumers still receive these setup events.
      case "vehicle_config":
        useVehicleConfigStore
          .getState()
          .receive(message.data?.player_id, message.data?.config);
        return;
      case "spawn_ok":
      case "spawn_ready":
      case "spawn_error":
      case "vehicle_changed":
      case "vehicle_change_error":
      case "vehicle_serviced":
      case "vehicle_service_error":
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
