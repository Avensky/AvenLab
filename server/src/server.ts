// server/src/server.ts

import express from "express";
import { Server } from "socket.io";
import { loadRapier } from "./rapier.js";
import { PhysicsWorld } from "./physics.js";
import http from "http";
import cors from "cors";


export async function startServer() {

    const RAPIER = await loadRapier();
    const physics = new PhysicsWorld(RAPIER);

    physics.createTestBox({ x: 0, y: 5, z: 0 });

    const app = express();
    app.use(cors());

    const httpServer = http.createServer(app);

    const io = new Server(httpServer, {
        cors: {
            origin: "*"
        }
    });

    // routes
    // app.get("/snapshot", (_req, res) => {
    //     res.json(physics.getSnapshot());
    // });

    // Broadcast snapshots at 20–60 Hz
    const frequency = 60; // Hz
    setInterval(() => {
        const snapshot = physics.getSnapshot();

        io.emit("snapshot", snapshot);
    }, 1000 / frequency);

    // setInterval(() => physics.step(1 / 60), 1000 / 60);

    // socket up
    io.on("connection", (socket) => {
        console.log("Client connected:", socket.id);

        socket.emit("hello", { msg: "welcome" });
    });

    // server up
    httpServer.listen(4000, () =>
        console.log("Server running at http://localhost:4000")
    );
}
