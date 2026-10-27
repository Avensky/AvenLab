# Game menus and capture-the-flag direction

Main, Pause and the tabbed panels share the compact cyan menu theme for pointer, keyboard and controller selection. Swarm Command remains a focusable planned item and performs no navigation. Signal Recon is an analysis workspace: only Sandbox accepts driving input or opens the in-game pause stack.

Missions, Career, Settings and the other tabbed panels fill the dynamic viewport. The shell does not shrink around short tabs; the header, tabs and footer remain outside the scrolling content. Tab changes reset content scrolling and keep the active tab visible on mobile.

The pause menu previously mapped Settings hover to Debugger and Leave hover to Settings. Menu labels, item counts and routes now share `frontend/src/game/menuItems.ts`. Mouse actions explicitly activate the clicked row; keyboard focus follows controller selection.

## Browser menu layout conventions

Design menus for the browser viewport, including short phone landscape windows with browser controls visible. Keep portrait layouts readable and allow scrolling when the content exceeds the available height.

- Use `GameButton variant="menu"` for game-menu actions and the shared `menu-control` class for native buttons, tabs and settings rows. Keep these controls square. Their idle, hover, keyboard focus and selected styles live in `frontend/src/components/menus/menus.css`; do not add separate per-screen colors or interaction effects.
- Display menu labels and values in uppercase through the shared CSS. Keep identifiers and routing strings unchanged.
- Keep controls near 28px minimum height with 2px vertical padding and 2px between rows. Text enlargement may grow rows naturally. Avoid large card padding and decorative empty space.
- Use the shared `MenuLogo` component. Preserve its 80px size, or 96px at wider breakpoints. In short landscape viewports, place branding beside the action list instead of spending more height or shrinking the logo.
- Keep the main-menu brand's three text lines close together. Main and Pause actions use compact title-only buttons; planned entries retain an availability label.
- In tabbed panels, show the title first and the secondary brand beside it, wrapping naturally rather than clipping. Keep subtitles accessible without reserving a separate visible paragraph. Keep the tab strip tightly wrapped around its buttons and keep only actual status messages in the footer.
- Preserve the full-screen tabbed shell, pinned header/tab navigation, safe-area insets, focus handling, high-contrast mode and reduced-motion preferences.

## Main-menu background and startup

Main loops the existing `/videos/NIWC-Pacific.mp4` behind its logo and buttons, with a dark tint for readability. The mode-loading screen uses the same `MenuVideoBackground` component. Playback is muted and inline for mobile; media is decorative and cannot intercept input. The video pauses while the document is hidden and is unmounted when leaving the screen. Browser or in-game reduced-motion settings use a static gradient instead. Missing media or rejected autoplay never blocks the menu; pointer/keyboard interaction can retry autoplay.

The HTML entry includes a centered logo before the JavaScript bundle is ready. App removes it on the first animation frame after its UI commits, without waiting for video, a game server or 3D assets. The game canvas is created only for Sandbox and the two vehicle setup screens. The loading video remains an existing public asset; no second copy is required.

## Garage Special selection stage

Sandbox and Signal Recon load `/models/world/garage_special.glb` for vehicle selection. The file lives in `frontend/public/models/world/`; public files are served without `/public` in their URLs. The complete source export is approximately 1.3 MB; the model URL uses a revision query to refresh the earlier partial asset. `garage.glb` and `big_e_cvn65.glb` remain available assets and are not requested by the selection screen.

The display clone removes the embedded `Lambo T M` demo vehicle, uses a uniform 0.06 display scale, and centers the selection on the `Plane_PISTE` floor. A downward ray finds the pad's highest horizontal surface, including its double-sided reversed winding; the roof is excluded from grounding. The garage's cached geometry, materials and authored source poses remain unchanged. The scale is for this display stage, not a gameplay or physical-world conversion. An explicit `VEHICLE_ANCHOR` or `GARAGE_ANCHOR` floor-level marker takes priority if supplied by a future export.

The source [Garage followers special! by Ahad4940, based on SDC's original](https://sketchfab.com/3d-models/garage-followers-special-71b1b4d569ec4c9788c76f4c3d56b461) uses Sketchfab material edits that are absent from the Blender GLB. Display-only material copies retain controlled green emission, charcoal glossy walls, lighter grey columns and aluminum/white tubing. Neutral ambient fill and two soft vehicle spotlights lift the scene without a broad green wash. HDR bloom runs before tone mapping and color conversion, at no more than 1× CSS-pixel resolution. A generated 128px environment contains a static copy of the completed garage and neutral highlights, so glossy materials reflect its fixtures without an HDRI download or a per-frame cube capture.

The supplied Blender source is now exported with evaluated Mirror/Array/Bevel geometry. The native GLB includes the complete 9x13 ceiling lattice, the 12-section mirrored upper trusses, the full light rack and stand feet. It is about 1.3 MB with Draco compression and omits the embedded demo car. Its `avenlabGarageComplete` scene marker keeps the original geometry and skips the legacy reconstruction helper. The native four-corner green fixture is hidden on the display clone, and the procedural corner-lamp fallback is omitted. The platform keeps its black/orange safety border. Scene lighting and bloom are unchanged. See [the source export workflow](GARAGE_ASSET_EXPORT.md) for the repeatable Blender script.

One 768px planar capture supplies both floor and platform reflections of the actual vehicle, roof, overhead lights and garage fixtures, avoiding recursive mirrors or a second scene capture. The floor continues beyond the asset edge and uses procedural 0.4m **square charcoal-black tiles with black grout**. The lifted tile base and moderate reflection strength keep dark wall reflections and bright grey pillar reflections on one consistent, readable tiled surface. A 0.55m grey perimeter strip follows the authored wall frame to restore the floor edging covered by the tiled overlay. The platform has stronger reflection (0.75) with a mostly sharp finish: 75% original capture and 25% adjacent-texel Gaussian smoothing. The reflector clips exactly at its raised surface (`clipBias: 0`); a positive bias had admitted the opaque pad's underside into the capture, blocking the car and ceiling reflections. Mipmapped filtering, derivative-smoothed safety stripes/edges and the existing depth offset remain. The complete black/orange diagonal safety border follows the turntable, without green corner lights. Green-dominant reflections receive a gentle 18% luminance-preserving desaturation so they better match their visible light sources; neutral ceiling/vehicle highlights keep their color. These details need no additional texture downloads. All owned reflection and bloom resources are released on unmount and are confined to selection, not Sandbox gameplay.

The wall counter retains its original **0999** appearance, including the unlit leading position, authored segment housings, bevels, glass and both native digit-light layers. The selection uses that original geometry directly in the scene, floor reflection and static environment probe. No replacement letters or generated sign geometry are added. The native counter and horizontal rack bars share the brighter `LIGHT` material (emission 4); bloom strength 0.24 and radius 0.15 give both a soft halo. The 1.6 threshold, background exposure, neutral lighting and other green material intensities are retained to preserve the dark room and modeled details.

Vehicle and environment selectors share compact strip styles: smaller uppercase names, the vehicle role beside its name, single-line secondary details and 36px arrow controls. The connected Sandbox footer is approximately 114px high at normal text scale; Recon is approximately 128px with its interface/mode row. Connection/status warnings can add height. Mouse, keyboard and controller indices/order and the cyan idle/hover/selection theme are preserved. Details remain in the DOM when visually truncated, and text scaling and small-screen scrolling still apply.

The original native `ShowroomFloor`, with a dark tiled-line grid, appears immediately while the garage loads and remains available on an asset error. Selection uses this stage instead of the modal video/loading card; vehicle loading no longer displays a centered text box. The readiness gate still runs, and gameplay keeps its loading screen. The garage is retained across vehicle changes, so it is not downloaded or rebuilt per model. No city, ship or HDRI is loaded here.

All five vehicles share one closer indoor camera position and orbit target, checked against the Tank chassis at desktop and phone aspect ratios. Portrait changes field of view instead of moving the camera outside the room; the 0.1 near plane retains the rack, ceiling tubes and fixtures instead of cutting them away. The camera does not auto-orbit the room. Only the authored `Plane_PISTE` pad, its edge trim, the selected car and contact shadow rotate, sharing one centered turntable pivot that survives model changes. The car's initial heading follows the long axis of the pad. Framing uses the full viewport; selection controls and headers remain transparent. Switching to/from Tank leaves the orbit untouched. Mouse/touch orbit remains available. Reduced Motion freezes the turntable and disables damping. Display placement uses one Tank chassis-based scale for all vehicles, excluding its cannon, so their original size ratios remain intact. The Tank rotates around its hull center while its cannon is allowed to extend beyond the pad; track bounds provide a fallback center if the chassis name is absent. Exact tire/track vertex bounds keep floor contact at Y=0; the shadow is scaled and offset under those supports. Unmounted model measurements are cached so the loaded garage size cannot compound the existing display scale. The Tank reference dimensions are lightweight metadata, avoiding a Tank download just to size a car. Current stage clearance produces a common factor of about 1.35, roughly 42% larger than the previous cannon-limited fit. A 60-degree vertical FOV minimum keeps the enlarged turret within the shared view; the cannon no longer constrains framing. These presentation transforms leave gameplay poses and source geometry unchanged.

Draco decoders are served by the app from `/draco/` rather than an external CDN. Keep the bundled decoder set and Apache 2.0 license together when upgrading Three.js. Vehicle files still load on demand and remain cached; the garage cannot eliminate their first download or decoding cost.


## Available now

- Pause: Resume game, Debugger, Settings, Change vehicle, View missions, Career, Leave game.
- Settings: Display, Audio, Keyboard, Controller, Social, Other, Accessibility.
- Working display controls: resolution scale, field of view, shadows, reflections, fog, sky, vehicle lights, HUD and performance overlay. Graphics preferences survive a new sandbox session.
- Working input controls: driving-key remapping, mouse-look sensitivity, gamepad stick deadzone, steering sensitivity and invert steering. Reserved shortcuts and duplicate bindings are rejected.
- Accessibility: larger menu text, high contrast and reduced motion. Reduced motion stops the vehicle turntable and menu transitions.
- Career: Statistics, History, Leaderboard, Favorites, Customize and Achievements. Vehicle favorites persist locally. Other career tabs show empty or planned states, without invented match results, wallet balances or earned rewards.
- Mission board: sandbox entry plus CTF objective, logistics and squad-role briefings. CTF is not playable yet.
- Debugger: Visualizers, Vehicles & GLBs, Environment, Rendering and Captures. **Open performance overlay** is the first action in Visualizers and Captures; it resumes gameplay with live stats without starting a recording. Close it with F3 or its × button. Per-vehicle/chunk/asset rendering remains independent. Timing and transport readouts live in the performance overlay.

Display/input/accessibility preferences and favorites are stored in browser local storage. They are device-local, not an account profile. Labeled performance captures are saved in this browser; JSON/CSV downloads make them shareable. See `docs/performance-recording.md` for countdowns, position/yaw, Copy Spawn and the centered-city material comparison. Audio and social controls are marked planned because their runtime services are not active.

## Input and menu behavior

| Input | Action |
| --- | --- |
| D-pad / either stick / arrows / WASD | Navigate rows |
| A / Enter / Space | Select row |
| Left / right | Adjust selected value |
| LB / RB / Q / E / Page Up / Page Down | Switch tabs |
| B / Escape | Back to pause or main menu |
| Start / Escape while driving | Open pause menu |
| H while driving / paused | Open the in-game vehicle picker |
| Shift+H while driving | Toggle hazards |
| F2 in Sandbox | Open/close Debugger, returning to driving or Pause as appropriate |
| F3 in Sandbox | Show/hide the latency overlay |
| Shift+F3 / View or Select in Sandbox | Show/focus the recorder inspector, or minimize it |
| F8 in Sandbox without a modal menu | Start/stop a performance capture |
| A / Cross while driving with latency overlay visible | Start/stop a performance capture |
| Mouse / touch | Select tabs and activate the actual clicked row |

The latency readout starts as a compact Name / Start–Stop / Export row with Open
and Close buttons. Open expands Position, Network / Physics and City Assets.
View/Select gives the inspector controller focus; D-pad navigates, LB/RB switches
tabs and B minimizes. Starting a capture releases focus for driving. View/Select
replaces the old controller CAN-dump action; keyboard C retains CAN dump.
Plain F2/F3 ignore key repeats, modified keys, text editing, loading, terminal
input and non-Sandbox screens; Shift+F3 is the explicit inspector shortcut.
See `performance-recording.md` for partial Stop and export behavior.

Focused text inputs retain editing keys. Native Tab navigation and visible focus outlines remain available. Opening menus releases held driving inputs; the gamepad must return to neutral before driving resumes. The online simulation continues while a menu is open.

Change vehicle opens an in-game picker over the current scene. H opens the same picker; Back returns to driving or Pause according to where it opened. Selecting another model sends a validated request to the Rust server and waits for acknowledgement. The server retains the connection, player identity, map, position in X/Z and rotation, adjusts ride height, rebuilds the vehicle collider/mass/wheels and stops its motion. A larger vehicle is rejected if it would overlap an obstacle; errors appear in the picker. The interpolation buffer resets when the model changes. Rebuild and restart the Rust server with this frontend update.

Leave game uses a separate full-width rectangular confirmation dialog, about one third-and-a-half of the viewport height. Cancel is focused first; mouse, keyboard and controller can confirm or return to Pause. Confirm disconnects the current vehicle, returns to Main and reconnects the lobby connection. Neither action claims to save progress.

## CTF systems to build next

The intended match is 15 minutes, first to three captures. At timeout, highest score wins; if tied, the last capture wins. A 0–0 match is a draw. Implement the state machine and win conditions on the Rust server, including flag pickup/drop/return, carrier elimination/disconnect, team spawn rules and post-match results.

1. **Squads and match lifecycle:** party membership, team/server chat, ready checks, matchmaking, team assignment, protected spawns and reconnect policy.
2. **Authoritative resources:** per-vehicle tank capacity and fuel mass, consumption from engine load/RPM/efficiency, thermal state from generated heat versus cooling, fuel starvation, overheat derating and repair state. Do not compute competitive resources or rewards in menu code.
3. **Resupply and logistics:** server-owned station locations, availability, refuel rates and costs, repair/cooling services, support cargo and transfer rules. Require proximity and safe station interactions; define interruption and depletion behavior.
4. **Mission planning:** route distance and elevation, expected travel time, estimated consumption, reserve fuel, station stops, fallback routes, cooling margin and team supply allocation. Planning estimates should use the same vehicle model as the simulation, with an explicit uncertainty margin.
5. **Persistent career and economy:** authenticated player IDs, match history, statistics, leaderboards, achievement events, inventory, upgrade loadouts and an auditable currency ledger. Validate purchases, ownership and rewards on the backend; apply them atomically and idempotently.

Efficient driving should emerge from the model. Aerodynamic drag grows with speed; low-speed operation is not automatically most efficient at every gear or load. Braking dissipates kinetic energy unless regeneration exists, and reacceleration costs fuel. Thermal load should depend on engine demand, speed/airflow, ambient conditions, damage and cooling equipment. Give players useful fuel/range/heat warnings before limiting mobility.

Vehicle roles can trade speed and agility against armor, cooling, tank size and support capacity. A runner needs return range; escorts need an exit route; a support vehicle needs a rendezvous and enough supplies for the next push. Define sidegrade and balance rules before enabling currency-funded upgrades.

## Verification

Run `npm --prefix frontend run lint`, `npm --prefix frontend run typecheck`, `npm --prefix frontend run build`, and `npm --prefix frontend run test:performance`.

Check every pause row using mouse hover/click, keyboard and a standard gamepad. Check tab changes with shoulders, value changes with left/right, Back from every tab, settings persistence after reload, favorites, long menu scrolling, small screens, and change/leave cancellation. Verify in-game model changes preserve the connection, identity and location; blocked swaps leave the original vehicle intact. Confirm Leave removes the old vehicle. Run `cargo test --locked --manifest-path avenlab-server/Cargo.toml` for the server regression suite.
