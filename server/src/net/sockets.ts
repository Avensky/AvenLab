import type { Socket } from "socket.io";
// import type RAPIER from "@dimforge/rapier3d";
// import { VehicleRegistry } from "../vehicleRegistry.js";

export function registerSocketHandlers(
    socket: Socket,
    // world: RAPIER.World,
    // registry: VehicleRegistry
) {
    console.log(`Socket events ready for: ${socket.id}`);

    // socket.on("input", (data) => {
    //     // const entity = registry.getVehicles().find(v => v.id === socket.id);
    //     if (!entity) return;

    //     const body = entity.body;

    //     body.applyImpulse(
    //         { x: data.fx, y: data.fy, z: data.fz },
    //         true
    //     );
    // });

    socket.on("disconnect", () => {
        // registry.removeVehicle(socket.id);
        console.log(`Client disconnected: ${socket.id}`);
    });
}
