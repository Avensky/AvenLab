# Game menus and capture-the-flag direction

The main-menu entries share the Sandbox button theme for pointer, keyboard and controller selection. Swarm Command remains a focusable planned item and performs no navigation. Signal Recon is an analysis workspace: only Sandbox accepts driving input or opens the in-game pause stack.

Missions, Career, Settings and the other tabbed panels fill the dynamic viewport. The shell does not shrink around short tabs; the header, tabs and footer remain outside the scrolling content. Tab changes reset content scrolling and keep the active tab visible on mobile.

The pause menu previously mapped Settings hover to Debugger and Leave hover to Settings. Menu labels, item counts and routes now share `frontend/src/game/menuItems.ts`. Mouse actions explicitly activate the clicked row; keyboard focus follows controller selection.

## Available now

- Pause: Resume game, Debugger, Settings, Change vehicle, View missions, Career, Leave game.
- Settings: Display, Audio, Keyboard, Controller, Social, Other, Accessibility.
- Working display controls: resolution scale, field of view, shadows, reflections, fog, sky, vehicle lights, HUD and performance overlay. Graphics preferences survive a new sandbox session.
- Working input controls: driving-key remapping, mouse-look sensitivity, gamepad stick deadzone, steering sensitivity and invert steering. Reserved shortcuts and duplicate bindings are rejected.
- Accessibility: larger menu text, high contrast and reduced motion. Reduced motion stops garage camera rotation and menu transitions.
- Career: Statistics, History, Leaderboard, Favorites, Customize and Achievements. Vehicle favorites persist locally. Other career tabs show empty or planned states, without invented match results, wallet balances or earned rewards.
- Mission board: sandbox entry plus CTF objective, logistics and squad-role briefings. CTF is not playable yet.
- Debugger: Visualizers, Vehicles & GLBs, Environment, Rendering and Captures. Per-vehicle/chunk/asset rendering remains independent. Timing and transport readouts live in the performance overlay.

Display/input/accessibility preferences and favorites are stored in browser local storage. They are device-local, not an account profile. Performance captures remain in memory until exported. Audio and social controls are marked planned because their runtime services are not active.

## Input and menu behavior

| Input | Action |
| --- | --- |
| D-pad / either stick / arrows / WASD | Navigate rows |
| A / Enter / Space | Select row |
| Left / right | Adjust selected value |
| LB / RB / Q / E / Page Up / Page Down | Switch tabs |
| B / Escape | Back to pause or main menu |
| Start / Escape while driving | Open pause menu |
| Mouse / touch | Select tabs and activate the actual clicked row |

Focused text inputs retain editing keys. Native Tab navigation and visible focus outlines remain available. Opening menus releases held driving inputs; the gamepad must return to neutral before driving resumes. The online simulation continues while a menu is open.

Change vehicle ends the current run and returns to the existing garage. It closes the connection so the server's existing disconnect cleanup removes the old vehicle, then reconnects before a new spawn. A duplicate spawn request on an existing connection intentionally retains that connection's original vehicle. Leave game also cleans up the current vehicle. Neither action claims to save progress.

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

Check every pause row using mouse hover/click, keyboard and a standard gamepad. Check tab changes with shoulders, value changes with left/right, Back from every tab, settings persistence after reload, favorites, long menu scrolling, small screens, and change/leave cancellation. Verify a real Rust connection removes the old vehicle and spawns the newly selected model after returning to the garage.
