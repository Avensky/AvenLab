// server/src/server.ts
import express from "express";
import http from "http";
import { loadRapier } from "./rapier.js";
import { PhysicsWorld } from "./physics.js";

export async function startServer() {
    const RAPIER = await loadRapier();
    const physics = new PhysicsWorld(RAPIER);

    physics.createTestBox({ x: 0, y: 5, z: 0 });

    const app = express();
    const httpServer = http.createServer(app);

    app.get("/snapshot", (_req, res) => {
        res.json(physics.getSnapshot());
    });

    setInterval(() => physics.step(1 / 60), 1000 / 60);

    httpServer.listen(4000, () =>
        console.log("Server running at http://localhost:4000")
    );
}
