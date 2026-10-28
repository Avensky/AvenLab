# Redline Vector frontend

React / TypeScript / React Three Fiber UI for the Rust vehicle sandbox and the
separate Signal Recon workspace. Rust owns simulation and resources. Stores
separate received world state, outgoing intent, sampled HUD data and preferences.

## Run and verify

From the repository root:

```sh
npm --prefix frontend ci
npm --prefix frontend run dev
npm --prefix frontend run test:performance
npm --prefix frontend run lint
npm --prefix frontend run build
```

Gameplay uses `src/net/rustSocket.ts`, a native WebSocket owner.
`VITE_RUST_WS_URL` overrides the endpoint; dev defaults to port 9001 on the
browser hostname, production to `/ws/`. CAN/ML uses its separate data-service
API. The React compiler is enabled in Vite. Backend changes also require Cargo
tests and a server rebuild; see the repository root scripts.

## Folder map

| Folder | Owns |
| --- | --- |
| `src/game/` | Screen/mode composition and menu pages |
| `src/game/modes/`, `src/game/preview/` | Mode workflows and garage staging |
| `src/components/menus/` | Shared controls/tabs, logo, focus, menu styles/video |
| `src/components/debugger/` | Debugger and physics visualizers |
| `src/ui/`, `src/ui/Dashboard/` | In-game DOM HUD, touch widgets and custom gauge designs |
| `src/controls/` | Keyboard/gamepad/touch lifecycle and input ownership |
| `src/net/` | Socket lifecycle, validation and message routing |
| `src/store/` | State ownership and display projection; [store reference](src/store/README.md) |
| `src/hooks/` | Interpolation and visual alignment |
| `src/world/`, `src/vehicles/`, `src/effects/` | World/model rendering and camera/effect code |
| `src/performance/` | Bounded measurements, recorder, archive/export and overlay |
| `public/models/`, `tests/` | Existing model assets and frontend verification |

Import specific stores directly. The legacy store/index barrel also imports
vehicle selection/render components and is a poor boundary for transport/HUD.

## Driving HUD

Enable **Settings → Display → Driving HUD & touch controls**. The restored
custom speed, RPM and paired fuel/temperature dials sit at bottom right, with
NOS outside RPM and a condition/repair meter. Pedals sit at bottom center;
compact screens lift the cluster above the touch row. Display saves speed units
and Pedals/Two joysticks. Joysticks steer left, gas/reverse right, brake center.

ABS/TCS buttons display confirmed server state. Q/T toggle them while driving;
Settings → Controller exposes the same requests to controller users. Rust now
owns fuel usage, load/airflow-based heat, overheat/condition derating, collision
damage, automatic driveline telemetry and finite NOS. Debugger → Vehicles & GLBs
has stationary, engine-off Sandbox service. Gas stations and competitive supply
rules are future systems.

The HUD projects at 20 Hz, independent of 60 Hz snapshots/input sending and
120 Hz physics substeps. Static SVG faces are memoized; short needle transitions
honor Reduce motion. Unsupported readings from an old server show dashes. The
driving HUD hides with modal menus and outside Sandbox.

- [Store responsibilities, authority, persistence and update rates](src/store/README.md)
- [Folder audit and refactoring order](../docs/FRONTEND_AUDIT.md)
- [HUD/resource model, tuning, wire protocol and shifter roadmap](../docs/VEHICLE_HUD.md)
- [Menus](../docs/GAME_MENUS.md), [recorder](../docs/performance-recording.md), [city performance](../docs/CITY_PERFORMANCE.md)
