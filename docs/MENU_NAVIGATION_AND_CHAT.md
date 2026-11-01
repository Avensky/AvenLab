# Menu navigation, compact chat and direct Recon entry

Selection routing is now described in [Mode first, hero second](MODE_FIRST_SELECTION.md).
Mode configuration and matchmaking come before the separate unpicked hero stage.

This cumulative follow-up updates the current hero-selection UI and retains the
prior cockpit, physics, social-world and alpha admission changes.

## Menu chrome and rows

Back controls in Settings/shared tabbed menus, Worlds & Social, Cockpit, hero and
legacy vehicle selection, and Recon headers use the existing red Xbox B glyph
without a surrounding rectangular plate. Hero Deploy/Enter uses the green A glyph
with the same borderless treatment. Keyboard focus uses an underline. Settings
omits the permanent "changes apply immediately" notice; actual errors and binding
results still appear when relevant.

Mode and hero selection have separate directional owners:

| Screen / row | Left / Right | LB / RB, Q / E, Page Up / Down |
| --- | --- | --- |
| Mode screen | Environment value or active CAN field value | Select a game mode immediately |
| Hero portrait grid | Move within the current three-column line | Change All / Tank / DPS / Support filter |

Up/Down changes portrait lines. The mode screen ignores Up/Down; its footer is
clickable but never required for A/Enter. Numpad 8/2/4/6, arrows and either stick
share this path. First A locks the preview; the next A advances. Role filters are
excluded from directional rows. Plain Tab/Shift+Tab never navigates UI; focused
text fields retain editing keys. See the current
[controls guide](SELECTION_CONTROLS_AND_GARAGE.md).

There is no vehicle arrow strip. Filters sit above portraits on the second screen;
configuration stays on the first screen's bottom edge. Only an assigned match's
hero screen displays team cards above the footer. A fresh mode starts unpicked,
with an initial ghost that becomes full opacity as soon as a portrait is previewed. The selected name/role remains at upper left.

## Signal Recon without an intermediate setup screen

Signal Recon shows the existing CAN interface/capture-mode bar controls at the
bottom of the mode screen. LT/RT or 1/3 changes the highlighted field; Left/Right
edits its value. A/Enter always continues with the current options. The garage, legacy setup bars and workspace dropdowns use the same
CAN store and option order. Shared captureSetup helpers own cycling/readiness.

Continue checks interface readiness and opens an unpicked hero screen. After a
hero is chosen, Enter Signal Recon validates the interface again, copies that
vehicle's CAN identity and opens the real analysis workspace directly. Live physical
interfaces must exist and be up; Simulation or the existing vcan0 path can enter
without a driving server. Invalid live choices stay in the garage with the actual
readiness error. The workspace Back action returns to the Signal Recon garage,
not the legacy setup page. Legacy routes remain for compatibility, but normal
Play/Back no longer visits them.

Entering analysis does not create a Rust driving seat or start CAN transmission.
Mission/capture actions still own starting an actual CAN session. Interface status
is refreshed on mode entry, without a polling loop. The real CAN/data service is
still required for physical captures and stored research data.

## Minimized minimap audit

The closed map and media/HVAC launchers have fixed 28 px dimensions. The closed
map button uses no fractional transform, transition or entry animation. Its clock
sits below the hub instead of underneath adjacent launcher buttons. Explicit
panel-state attributes choose the layout in the same render as panel contents;
launchers have stable keys and the map shell/dock/icons are memoized. A single
isolated fixed layer and opaque icon faces avoid tiny translucent SVG blends
over the moving WebGL scene. Expanded map content
continues to unmount on collapse, while radio/climate state remains preserved.

Browser regression samples check unchanged button identity, position, size,
opacity and animation during live telemetry/clock updates, plus repeated map
toggles. Software-browser checks do not certify every physical phone's compositor.

## Chat and activity timeline

Idle chat contains only its small launcher. Click it or use:

| Context | Controller | Keyboard |
| --- | --- | --- |
| Mode / hero selection | X | T |
| Driving | RB + View | Enter |

Driving keeps its existing X engine toggle, T traction toggle and View diagnostics
shortcut. B closes a focused chat without leaving the menu or applying handbrake.
With the assisted keyboard open, B first closes the keyboard; B again closes chat.

An empty, inactive panel returns to its launcher after six seconds. Draft text,
an in-flight send or the assisted keyboard holds it open. One owned timeout is
renewed on interaction and cleared on unmount. The native field is blurred on
collapse, with prior menu focus restored when possible. No hidden input, log or
channel boxes remain in the minimized presentation.

New messages from another player and relevant player/world activity briefly open
the panel without taking focus. History loads and duplicate event/ack packets do
not reopen it. Each profile/context loads history once until membership changes.
The driving HUD reuses the real chat component instead of the old placeholder.

Presence notices derive from validated, personalized server social views. The
first view establishes a baseline. Subsequent views report current-world joins,
leaves, disconnections and reconnects; lobby views report connection changes.
Changes in another world do not create local-world notices. Own world changes
produce a confirmed local notice. No arbitrary event text is transmitted as chat,
and no initial snapshot invents a series of joins.

Messages retain the Rust sender/audience validation, size/rate/history bounds and
ack deduplication from the previous patch. Local presence holds at most 50 notices;
the combined visible timeline holds at most 50 rows. Old world/profile baselines
clear on changes or socket reset. Nothing is written to profile/world saves.
There is no additional socket, simulation, requestAnimationFrame or polling loop.

## Install and validation

Rebuild and restart both the frontend and Rust server. The unpicked seat policy
requires this server update; commands are in the package README. The cumulative installer backs up changed bytes and has an
exact undo path.

validation.json records completed checks and their scope. Browser CAN status and
empty progress responses are explicit read-only fixtures, not physical hardware
capture tests. World/chat checks use a real disposable local Rust server and fake
local test profiles. Desktop/mobile layouts and injected controller polling do
not certify a physical controller, phone GPU or rented-host capacity.
