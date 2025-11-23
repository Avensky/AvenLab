// server/src/server.ts

import express from "express";
// import { Server } from "socket.io";
// import { loadRapier } from "./rapier.js";
// import { initPhysics, PhysicsWorld } from "./physics/physics.js";
// import type { PlayerInput } from "./types.js";
// import type { PlayerInputMessage } from "./types.js";

import http from "http";
import cors from "cors";

// interface PlayerState {
//     socketId: string;
//     bodyId: string;
//     input: PlayerInput;
//     lastInputSeq: number;
// }

// const players = new Map<string, PlayerState>();

export async function startServer() {

    // await initPhysics();

    // const RAPIER = await loadRapier();
    // const physics = new PhysicsWorld(RAPIER);

    // physics.createTestBox({ x: 0, y: 5, z: 0 });

    const app = express();
    app.use(cors());

    const httpServer = http.createServer(app);

    // const io = new Server(httpServer, {
    //     cors: {
    //         origin: "*"
    //     }
    // });

    // // Broadcast snapshots at 20–60 Hz
    // let tick = 0;
    // const tickRate = 60;          // physics ticks per second
    // const snapshotRate = 60;      // snapshots per second
    // const dt = 1 / tickRate;

    // let accumulator = 0;
    // let lastTime = Date.now();

    // setInterval(() => {

    //     const now = Date.now();
    //     const elapsed = (now - lastTime) / 1000;
    //     lastTime = now;
    //     accumulator += elapsed;

    //     while (accumulator >= dt) {
    //         // apply inputs for each player before stepping
    //         for (const p of players.values()) {
    //             physics.applyInput(p.bodyId, p.input, dt);
    //         }
    //         physics.step(dt);
    //         tick++;
    //         accumulator -= dt;
    //     }

    //     const worldSnapshot = physics.getSnapshot(tick);
    //     // send snapshot at snapshotRate
    //     for (const p of players.values()) {
    //         // Per-player snapshot with ack + self id
    //         const payload = {
    //             world: worldSnapshot,
    //             yourBodyId: p.bodyId,
    //             lastProcessedInputSeq: p.lastInputSeq
    //         };

    //         // Send only to that player
    //         io.to(p.socketId).emit("snapshot", payload);
    //     }

    // }, 1000 / snapshotRate);

    // // socket up
    // io.on("connection", (socket) => {
    //     console.log("Client connected:", socket.id);
    //     socket.emit("hello", { msg: "welcome" });
    //     console.log("Client connected:", socket.id);

    //     // Create a body for this player
    //     const spawnX = (Math.random() - 0.5) * 10;
    //     const spawnZ = (Math.random() - 0.5) * 10;
    //     const bodyId = physics.createPlayerBody({ x: spawnX, y: 2, z: spawnZ });

    //     players.set(socket.id, {
    //         socketId: socket.id,
    //         bodyId,
    //         input: { throttle: 0, steer: 0 },
    //         lastInputSeq: 0,
    //     });

    //     socket.on("input", (msg: PlayerInputMessage) => {
    //         const p = players.get(socket.id);
    //         if (!p) return;

    //         p.input = { throttle: msg.throttle, steer: msg.steer };
    //         p.lastInputSeq = msg.seq;
    //     });

    //     socket.on("disconnect", () => {
    //         console.log("Client disconnected:", socket.id);
    //         const p = players.get(socket.id);
    //         if (p) {
    //             physics.destroyBody(p.bodyId);
    //             players.delete(socket.id);
    //         }
    //     });
    // });


    // server up
    httpServer.listen(4000, () =>
        console.log("Server running at http://localhost:4000")
    );
}
