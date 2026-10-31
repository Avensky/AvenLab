# Find the owner before editing

Start from the outcome you want. Each linked section has a file-by-file editing
recipe and public entry point. TypeScript features expose `index.ts`; Rust uses
`mod.rs`; Python packages use `__init__.py`. Internal modules import concrete
siblings so public barrels do not create circular initialization.

| Desired change | Feature / source of truth | State or server owner |
| --- | --- | --- |
| Main/pause rows, screens, back behavior | [game menus](../frontend/src/game/menus/README.md) | [store/menus](../frontend/src/store/menus/README.md) |
| Alpha modes, hero wall, queues and progression | [alpha UI](../frontend/src/game/alpha/README.md) | Rust alpha/ + server/alpha_sessions.rs |
| HUD radio/map/climate minimization | ui/hud/UtilityDock.tsx | [HUD layout state](../frontend/src/store/hud/README.md) |
| Teammates, social groups and private worlds | [social menus](../frontend/src/game/social/README.md) | Rust server.rs + social/; frontend net/socialClient.ts |
| Assisted controller/touch text entry | components/text | [text store](../frontend/src/store/text/README.md); keyboard routing precedes menus |
| Themes, contrast, text size, reduced motion | [shared theme](../frontend/src/theme/README.md) | [store/preferences](../frontend/src/store/preferences/README.md) |
| Xbox glyphs / displayed shortcuts | [controller components](../frontend/src/components/controller/README.md) | controls/GameController.ts + inputRouting.ts |
| Keyboard/gamepad/touch behavior | [controls](../frontend/src/controls/README.md) | [store/input](../frontend/src/store/input/README.md) |
| Pause braking | store/menus/uiStore.ts transition policy | inputStore merges the hold; existing sender sends it |
| Driveable vehicle physics/dimensions | [Rust](../avenlab-server/README.md) | vehicle_setup, physics, vehicle_forces, aven_tire |
| Engine/heat/fuel/NOS/condition | Rust powertrain.rs | Rust fixed-tick simulation |
| Packed vehicle electronics for research/agents | cockpit UI + store/input/protocol | Rust cockpit.rs / state.rs |
| Wheel, gauges and warning lights | [Dashboard](../frontend/src/ui/Dashboard/README.md) | [20 Hz sampled telemetry](../frontend/src/store/telemetry/README.md) |
| Driving HUD placement / ignition fade | ui/drivingHud.css + Cockpit/DrivingIgnition.tsx | visibility/ignition preferences |
| Physical press feedback / control sizes | Cockpit/useMomentaryFeedback.ts + driverConsole.css | transient contact attributes; system status stays authoritative |
| Held headlight flash / raised beams | Cockpit/ColumnStalks.tsx + vehicles/tools/headlightBeam.ts | inputStore source holds; cabin bit 20; Rust cockpit v6 |
| Ignition ring / clicking sound | Cockpit/IgnitionSwitch.tsx + starterRelayAudio.ts | Rust powertrain STARTING/running; one shared audio owner |
| Radio player, mission apps / warnings | [Cockpit](../frontend/src/ui/Cockpit/README.md) | store/radio + store/missions; confirmed telemetry wins warnings |
| GPS / minimap | [Minimap](../frontend/src/ui/Minimap/README.md) + navigation | navigationStore waypoint/mission + 10 Hz map pose |
| World editing, spawns, snapping | [worldBuilder](../frontend/src/worldBuilder/README.md) | document + state; Rust only changes after map install |
| Road sidewalks / measured colliders | worldBuilder/roads + scripts/build-road-colliders.mjs | shared generated road-colliders.json + Rust road_colliders |
| Selection special garage / placeable garage | game/preview + worldBuilder/models | model masks and measured placement-colliders.json |
| Static background vehicles | worldBuilder/vehicles | decorative layout references; no traffic AI/physics |
| Live map/chunks / city visuals | [world renderer](../frontend/src/world/README.md) | worldStore map + renderSettings preferences |
| Vehicle/world setup choices | [selection](../frontend/src/store/selection/README.md) | selectionStore; Rust approves spawn/change |
| WebSocket fields / interpolation | [net](../frontend/src/net/README.md), hooks | networkStore raw state; Rust state.rs |
| CAN experiments / session steps | [Recon state](../frontend/src/store/recon/README.md) + game/modes/recon | one composed Recon store |
| CAN capture/session/playback API | [capture](../data-server/app/can/capture/README.md) | Pi/server clock + PostgreSQL |
| CAN evidence, AI and hypotheses | [analysis](../data-server/app/can/analysis/README.md) | analysis modules; specialized model requests |
| Human labels / calibrated models | [learning](../data-server/app/can/learning/README.md) | model/label/training modules |
| Performance comparisons | [performance](../frontend/src/performance/README.md) | bounded recorder, capture archive; F3/F8 |

## Import and edit conventions

```ts
import {useInputStore, VehicleFlags} from './store/input';
import {useUIStore} from './store/menus';
import {usePreferencesStore} from './store/preferences';
```

`store/index.ts` remains a data-only convenience API. It no longer imports all
vehicle renderers through selection metadata. For a hot loop, read getState or
inputRef and avoid a React subscription. For a component, subscribe to the exact
primitive it displays. Never create an input sender in a component.

Editor callers can import the public `worldBuilder/index.ts`. Rendering modules
and editor internals use the smaller document/state/asset entries. Input/network
code should not import the renderer entry point to read a type.

## Saved versus live state

Browser preferences own layout/style/accessibility. Editor documents own saved
pieces/spawns/history; Export installs them only after a Rust restart. The live
map, setup selection, and editing-world selection are separate. Rust owns
physics/resources/electronics confirmation; the frontend owns requested commands.
Research sessions and gameplay mission presentation are separate features.

All seven base themes are selectable: Navy blue, Hacker green, Bat black, Deep
purple, Pastel purple, Strawberry and White. Future earned visual variants may
use gameplay reward events. Contrast, text size, reduced motion and these base
palettes remain available without achievements.

## Working checks

From repo root: `npm --prefix frontend run lint`, `npm --prefix frontend run
build`, and `cargo test --manifest-path avenlab-server/Cargo.toml --locked`.
From `frontend/`, run `node --test --test-concurrency=1 tests/*.test.mjs`.
For data service: activate its environment, then `python -m unittest discover
-s tests -v` from data-server. See [audit](REPO_AUDIT.md) for test scope and what
still requires a running service/real rendering hardware.

Comment-only historical examples are preserved under `frontend/legacy`.
Generated assets and collision catalogs keep their public URLs/storage contracts.

## Cockpit control editing update

The cockpit now has [focused feature APIs and editing guides](../frontend/src/ui/Cockpit/README.md) for circular stalk geometry, mechanical controls, ignition artwork, pages/navigation and CSS. Climate has its own page with compact/full HUD choices; Research owns shared visibility shortcuts. Parking appearance/crystals are device preferences. The drifting pull uses the existing rear-brake input; failure/wear requires a separate Rust model.
