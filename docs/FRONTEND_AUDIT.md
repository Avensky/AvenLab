# Frontend structure audit

Baseline: main `256c9ae33e9feede1b3d8ace9549ce467c0a200b` (updated overlay menu for mobile).
Existing city, view distance, interpolation, garage and recorder work is retained.

| Finding | Change / next action |
| --- | --- |
| Dashboard files were disabled before the latest gauge upload; the uploaded code depended on the retired useStore/mutation/maxBoost API | Integrated the designs with explicit props, shared SVG geometry, a calibration store and 20 Hz display projection. |
| Socket ignored vehicle_config; Rust sent it for Change Vehicle but not initial spawn | Added first-spawn setup calibration and its dedicated frontend consumer. |
| RPM/gear/fuel/temp were zero placeholders and BOOST had no Rust definition | Added server-owned automatic driveline telemetry, fuel, thermal state, condition and finite NOS. Explicit availability keeps older-server zeros from showing false readings. |
| Pedals/steering called setAnalog directly | Added independent source ownership, pointer capture, multi-touch and lifecycle release. Joystick choice is saved. |
| Generic control/arrow/pedal rules occupied App.css | Scoped driving controls and gauge styles; App.css now keeps shell/menu imports. |
| Four independent gauge canvas loops restarted on telemetry changes | Memoized SVG faces, bounded display sampling and CSS needle transitions replace repeated drawing/image work. |
| Frontend README was Vite boilerplate; store authority/rates were unclear | Added project structure and full store/rate documentation. |

After integrating the gauge files, **45 other TS/TSX files remain entirely
line-commented**, plus some empty stubs. These include old Menu/Minimap,
audio/boost/dust/skid effects and most of `ui/CommandLine/`. The latest main's
deletions of the retired DebugOverlay, Help and Keys files are retained.
The active lightweight terminal is `ui/command/CommandLine.tsx`. These folders
duplicate concepts and use inconsistent naming; their names are not an actual
case-only collision. Existing paths remain stable for this integration.

## Folder responsibilities

| Folder | Purpose |
| --- | --- |
| `game/`, `game/modes/`, `game/preview/` | Screen composition, mode workflows and garage staging |
| `components/menus/`, `components/debugger/` | Shared menu primitives and debugger visualizers |
| `ui/`, `ui/Dashboard/` | In-game DOM HUD, touch widgets and custom instruments |
| `controls/` | Keyboard/gamepad/touch lifecycle and input ownership |
| `net/`, `store/` | Transport boundary and explicit state ownership |
| `world/`, `vehicles/`, `hooks/` | City/model rendering, interpolation and alignment |
| `performance/` | Bounded recording, diagnostics, persistence and exports |

## Recommended refactoring order

1. **Completed:** migrate gauges and touch controls through typed ownership;
   document rates and keep resources authoritative in Rust.
2. Split selection catalog data from render-component imports. The broad
   store/index barrel currently brings all vehicle components into unrelated
   consumers. New network/HUD code imports specific stores directly.
3. Consolidate terminal views behind the active entry point, one API-backed
   view at a time. Classify old upper-folder code as reusable, duplicate or
   obsolete before archiving/deleting it. Keep its designs in git history.
4. Retire duplicate gameStore screen/selection and worldStore display fields
   after call-site review. uiStore owns routing, selectionStore owns setup
   indexes, renderSettingsStore owns graphics choices.
5. Bound CAN logs/frame collections and split the large recon workflow when
   that research mode resumes. Its lifecycle stays separate from driving.
6. Version the network schema and measure packet sizes before quantizing
   numeric telemetry. Test codec round-trips, units and old-server fallback.

`gameStore` is labeled low-frequency but its old RotatingCamera contains a
frame-rate angle writer when mounted/active. A future camera cleanup should
keep transient angles in local refs. The normal routing/settings fields remain
event-driven. See [store reference](../frontend/src/store/README.md).

The rear handbrake input and older radio/visual/audio experiments still
need their own backend/feature audit. This patch keeps the working foot brake
and assists explicit. A VSC/Sport mode needs stability-control behavior before
its badge should appear. Future lowercase folder renames should use a temporary
git path so Windows records case changes reliably.

The existing Reset request now recovers an upright pose on clear road once per
press, preserving fuel, heat, condition and NOS. Repairs/refills require the
explicit parked, engine-off Sandbox service action.
