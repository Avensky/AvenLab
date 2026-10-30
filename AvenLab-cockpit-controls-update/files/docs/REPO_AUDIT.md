# Repository audit and organization update

Base: `fc9e460a63430198a4c53e9278b3e9a54050d801` (added world editor).
This is a source/ownership and hot-path audit with behavior validation. It is not
a claim that every possible gameplay, device, database or network path was run.

| Finding | Change | Reason / practical limit |
| --- | --- | --- |
| Store files mixed unrelated ownership in one folder | Domain folders, public index.ts, README per section; Recon split into composition/types/protocol/selection/session/run/runtime/identity | Same store instances and persisted keys; no second mission or input owner |
| Zustand was imported directly but declared only transitively | Declared the already locked/installed 5.0.14 as a direct dependency | No runtime version change |
| Selection state imported every vehicle renderer | Data-only vehicleCatalog; removed unused Component field | Menu/state imports do not register all vehicle render components |
| Python CAN files mixed capture, analysis, learning and HTTP endpoints | capture / analysis / learning packages with explicit dependency imports and public package entry points | 192 original function/class bodies retained; 34-path HTTP contract preserved |
| Comment-only retired UI/audio examples obscured searches | 44 modules preserved outside active src in frontend/legacy | Nothing is reactivated; old monolithic stores remain retired |
| Pausing released throttle but let a car coast | Shared Pause/world-editor brake hold; child menus retain it, Resume releases neutral | Existing sender and Rust service brake; online simulation continues. Direct cockpit access does not invent a brake during a research run |
| No editable saved spawn authoring | Team markers, XYZ/heading, shared history/save/export, source import and optional server surface_y | Editor degrees convert to runtime radians; support height is separate from body clearance |
| Sidebar repeated a large settings/file area | Header visibility/minimize controls, six focused inspector sections | Editing world is one header selector; export title is file metadata |
| Hidden driving scene stayed mounted during editor use | Driving renderers/camera unmount while authoring | Physics/socket continue; cached assets are reused when returning |
| Editor canvas ran continuously while idle | Demand rendering, explicit ghost invalidation, LOD checks compatible with demanded frames | Real WebGL interaction/LOD is checked separately; gameplay still renders continuously |
| Minimap pose invalidated SVG at the gauge rate | 10 Hz projection from the same 20 Hz sampler; memoized static roads/routes retained | No added polling timer or physics rate change |
| Radio and cockpit shells read unrelated cabin/speed values | Mission/media head unit; research controls mount on demand; cruise speed subscription only on cruise page | Deterministic test: 40 changing speed samples cause zero radio-shell commits after setup |
| Live CAN logs/append buffers could grow indefinitely | 1,000 visible logs; 20,000 live frames; explicit drop count and batch append | Full explicit playback imports remain lossless; PostgreSQL remains full capture authority |
| Dev dependency scanning tried standalone preview virtual modules | Vite scans index.html; workbench uses its existing dedicated build | Avoids unnecessary preview prebundle work and unresolved virtual bundle scan |
| Cockpit bypassed shared accessibility styling | Shared tokens/persisted seven-palette choice, contrast/text scale/reduced motion and colored Xbox glyphs | Physical wheel/gauge art and semantic warning/controller colors retain meaning |
| Physical switches retained enabled/hover/focus glow after release | Delegated momentary contact feedback, pointer focus prevention and repeat-key suppression | Status remains exposed separately; real browser Space applies the brake after a TCS click; controller A bridges true press/release and cancels on disconnect |
| Light flash lacked a held server input | Cockpit v6 cabin bit 20, source ownership, confirmed lamp masks and raised existing SpotLights | Release restores OFF/AUTO/LOW/HIGH; older server controls stay disabled |
| Parking bank dwarfed assists; cruise cap crowded a spoke | Equal 43px parking/assist banks next to the 90px shifter, raised cruise stalk, mobile key clearance | Parking cable strength remains mechanically latched |
| Key lacked a full pressed/cranking ring and relay sound | Full circle illumination, confirmed STARTING flicker, one gesture-unlocked clicking audio owner | No new audio asset or idle timer; release/stale/running/unmount stop sound; reduced motion is steady |

The main JavaScript build moved from about 2,299.71 kB before the research-page split to 2,158.64 kB with the control additions (631.48 → 599.02 kB gzip). This is an initial-load improvement measured within this update, not a gameplay FPS measurement. The radio now uses font-independent SVG transport icons and mobile headers avoid overlapping the inspector button.

## Remaining performance work

The dominant GPU costs can still be detailed city GLBs, geometry/material draw
counts, shadows, full garage decoration and multiple full vehicle models. The
existing LOD/proxy budgets remain in place. This update does not assert that a
React subscription was the sole cause of a reported frame hitch.

Measure the same route/car/map/quality/range, after asset warmup, with F3/F8.
Compare p95/p99 frame time, draw calls/triangles, upload warmup, server work and
packet timing separately. A software/headless browser run is a correctness and
layout check, not a target-machine FPS benchmark. Real host measurements are
needed before increasing detail budgets or changing the tire/physics tick.

The large Recon mission/playback/brain pages and Rust physics orchestration are
still substantial files. Their owners and editing recipes are documented; this
patch does not rewrite their algorithms while reorganizing navigation and state.
The Python analyze-session coroutine remains one documented orchestration entry
in analysis/run.py; its evidence/helpers have concrete modules.

## Feature boundaries retained

World builder Save is a browser draft, not a live map mutation. Road/garage
physics use measured surfaces. Background cars are decorative; this update does
not create traffic AI. Objective markers do not implement scoring/CTF/escort.
Mission radio consumes confirmed gameplay events; mission completion logic,
voiced radio assets and reward persistence are future gameplay work. Base themes
and accessibility settings are available without unlocks.

## Validation

270 frontend tests, 101 Rust tests, 4 Python tests, frontend lint/typecheck/production build, and desktop/mobile browser interaction checks passed. Python relocation preserved all 192 function/class bodies and the 34-path HTTP contract. The editor rendered zero additional frames during an idle browser check. Browser controls also passed physical-release, Space braking, all stalks, held flash, confirmed ignition, seven palettes and narrow-layout checks. See the update package README for install instructions. Coverage includes
frontend input/menu/telemetry/research/editor tests; Rust handling, road, garage,
spawn and Jump Lab tests; Python offline routes/helpers; OpenAPI comparison;
and browser layout/interaction/LOD checks. PostgreSQL, real SocketCAN hardware,
Ollama inference, multiplayer load and target-device FPS are not exercised by the
offline checks.
