#!/usr/bin/env node
/** Local WebSocket hero-chat regression. Uses a disposable social file and server;
 * it never connects to a user's running game or contacts external players. */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import net from "node:net";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const binary =
  process.env.AVENLAB_SERVER_BIN ??
  path.join(
    repo,
    "avenlab-server/target/debug",
    process.platform === "win32" ? "avenlab-server.exe" : "avenlab-server",
  );
if (!fs.existsSync(binary))
  throw new Error(
    "Build the Rust server first: cargo build --manifest-path avenlab-server/Cargo.toml",
  );
const directory = fs.mkdtempSync(path.join(os.tmpdir(), "avenlab-chat-e2e-"));
const reserve = net.createServer();
await new Promise((resolve) => reserve.listen(0, "127.0.0.1", resolve));
const port = reserve.address().port;
await new Promise((resolve) => reserve.close(resolve));
const child = spawn(binary, [], {
  cwd: path.join(repo, "avenlab-server"),
  env: {
    ...process.env,
    AVENLAB_ALPHA_LIMITS: "0",
    AVENLAB_BIND: `127.0.0.1:${port}`,
    AVENLAB_SOCIAL_PATH: path.join(directory, "social.json"),
    AVENLAB_MAX_ACTIVE_WORLDS: "2",
    AVENLAB_MAX_PLAYERS: "10",
  },
  stdio: ["ignore", "pipe", "pipe"],
});
let output = "";
for (const stream of [child.stdout, child.stderr])
  stream.on("data", (data) => {
    output = (output + data.toString()).slice(-64000);
  });
const started = new Promise((resolve, reject) => {
  const timer = setTimeout(
    () =>
      reject(
        new Error("Local server startup timed out. " + output.slice(-1000)),
      ),
    15000,
  );
  child.stdout.on("data", (data) => {
    if (data.toString().includes("WebSocket listening")) {
      clearTimeout(timer);
      resolve();
    }
  });
  child.once("error", reject);
  child.once("exit", (code) => {
    clearTimeout(timer);
    if (code) reject(new Error("Local server exited: " + code));
  });
});

class Peer {
  constructor() {
    this.messages = [];
    this.waiters = [];
    this.serial = 0;
    this.view = null;
    this.socket = new WebSocket(`ws://127.0.0.1:${port}`);
    this.socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      this.messages.push(message);
      if (this.messages.length > 200) this.messages.shift();
      if (message.type === "social_state") this.view = message.data;
      for (const waiter of [...this.waiters])
        if (waiter.predicate(message)) {
          clearTimeout(waiter.timer);
          this.waiters.splice(this.waiters.indexOf(waiter), 1);
          waiter.resolve(message);
        }
    });
  }
  wait(predicate) {
    const previous = this.messages.findLast(predicate);
    if (previous) return Promise.resolve(previous);
    return new Promise((resolve, reject) => {
      const waiter = {
        predicate,
        resolve,
        timer: setTimeout(() => {
          this.waiters.splice(this.waiters.indexOf(waiter), 1);
          reject(
            new Error(
              "Expected local packet did not arrive. " + output.slice(-500),
            ),
          );
        }, 12000),
      };
      this.waiters.push(waiter);
    });
  }
  async ready(name) {
    const welcome = await this.wait((message) => message.type === "welcome");
    this.player = welcome.player_id;
    this.identity = await this.command("identify", { name });
    return this;
  }
  async command(action, fields = {}) {
    const request_id = `test-${++this.serial}`;
    const response = this.wait(
      (message) =>
        message.type === "social_result" && message.request_id === request_id,
    );
    this.socket.send(
      JSON.stringify({ type: "social_request", action, ...fields, request_id }),
    );
    const message = await response;
    if (!message.ok) throw new Error(message.message);
    return message.data;
  }
  social(predicate) {
    if (this.view && predicate(this.view)) return Promise.resolve(this.view);
    return this.wait(
      (message) => message.type === "social_state" && predicate(message.data),
    ).then((message) => message.data);
  }
  async spawn(map) {
    const result = this.wait(
      (message) => message.type === "spawn_ready" && message.map === map,
    );
    this.socket.send(
      JSON.stringify({
        type: "spawn_request",
        vehicle: "brz",
        map,
        mode: "sandbox",
      }),
    );
    await result;
  }
  close() {
    for (const waiter of this.waiters) clearTimeout(waiter.timer);
    this.waiters = [];
    this.socket.close();
  }
}
const peers = [];
const passed = [];
try {
  await started;
  const a = await new Peer().ready("Host");
  peers.push(a);
  const b = await new Peer().ready("Blue teammate");
  peers.push(b);
  const c = await new Peer().ready("Red teammate");
  peers.push(c);
  const d = await new Peer().ready("Other world");
  peers.push(d);
  const one = (
    await a.command("world_create", {
      name: "Chat match",
      map: "road_precision",
      listed: true,
      max_players: 10,
    })
  ).world_id;
  const two = (
    await d.command("world_create", {
      name: "Other match",
      map: "road_precision",
      listed: true,
      max_players: 10,
    })
  ).world_id;
  for (const peer of [a, b, c])
    await peer.command("world_join", { world_id: one });
  await d.command("world_join", { world_id: two });
  const ownTeam = (
    await a.wait((m) => m.type === "world_changed" && m.world?.id === one)
  ).world.team;
  const sameTeam = (
    await c.wait((m) => m.type === "world_changed" && m.world?.id === one)
  ).world.team;
  assert.equal(ownTeam, sameTeam);
  const response = await a.command("chat_send", {
    channel: "team",
    text: "Ready on the red side",
    author_id: d.identity.profile_id,
    name: "Forged",
  });
  const message = await c.wait(
    (m) => m.type === "chat_message" && m.data?.id === response.message.id,
  );
  assert.equal(message.data.name, "Host");
  assert.equal(message.data.author_id, a.identity.profile_id);
  assert.equal(message.data.text, "Ready on the red side");
  const blueHistory = await b.command("chat_history", {
    channel: "team",
    world_id: one,
    team: ownTeam,
  });
  const otherHistory = await d.command("chat_history", {
    channel: "team",
    world_id: one,
    team: ownTeam,
  });
  assert.equal(blueHistory.messages.length, 0);
  assert.equal(otherHistory.messages.length, 0);
  assert.equal(
    b.messages.some(
      (m) => m.type === "chat_message" && m.data?.id === response.message.id,
    ),
    false,
  );
  assert.equal(
    d.messages.some(
      (m) => m.type === "chat_message" && m.data?.id === response.message.id,
    ),
    false,
  );
  passed.push(
    "real team chat reaches only the current world/team and ignores forged sender/audience fields",
  );
  const lobby = await a.command("chat_send", {
    channel: "lobby",
    text: "Hello lobby",
  });
  await d.wait(
    (m) => m.type === "chat_message" && m.data?.id === lobby.message.id,
  );
  assert.equal(
    (await c.command("chat_history", { channel: "lobby" })).messages[0].text,
    "Hello lobby",
  );
  passed.push(
    "lobby broadcast and bounded history use the same authenticated socket",
  );
  await assert.rejects(
    a.command("chat_send", { channel: "lobby", text: "x".repeat(281) }),
    /280/,
  );
  await a.command("chat_send", { channel: "lobby", text: "third" });
  await assert.rejects(
    a.command("chat_send", { channel: "lobby", text: "fourth" }),
    /quickly/,
  );
  passed.push("message length and burst limits are enforced by Rust");
  for (const peer of [a, b, c]) await peer.command("world_leave");
  await a.command("world_join", { world_id: one });
  assert.equal(
    (await a.command("chat_history", { channel: "team" })).messages.length,
    0,
  );
  const persisted = fs.readFileSync(
    path.join(directory, "social.json"),
    "utf8",
  );
  assert.equal(persisted.includes("Ready on the red side"), false);
  passed.push(
    "unloaded-world team history is discarded and chat is absent from saved profiles",
  );
  console.log(JSON.stringify({ passed, failures: 0 }, null, 2));
} finally {
  for (const peer of peers) peer.close();
  child.kill();
  await new Promise((resolve) => {
    if (child.exitCode !== null) resolve();
    else child.once("exit", resolve);
  });
  fs.rmSync(directory, { recursive: true, force: true });
}
