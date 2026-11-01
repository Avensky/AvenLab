# UI layout refresh — October 30, 2026

Built against `35d8bdd6402197a060b1f92a594f6bc7f3715edb`, preserving the previous
alpha UI changes. Server slots, queues, reconnection and role validation retain
their current behavior. The portrait/chat follow-up requires rebuilding and restarting Rust and frontend together.

## Driving HUD

Radio and climate occupy one right-hand vertical stack at every viewport size.
An open minimap pushes that stack down. Existing circular minimize controls
collapse individual units and leave launchers beside/on the map.

Cockpit → Radio replaces the select with three saved buttons:

| Button | Driving presentation |
| --- | --- |
| MINIMIZED | Small title/status/power/mission head; transport controls unmount |
| WITH DIALS | Full transport/volume dial and Radio/Missions tabs |
| NO TAB BAR | Full transport/volume dial; direct mission button replaces tabs |

New profiles default to No Tab Bar. Existing Classic/Streamlined preferences keep
the corresponding With Dials/Minimized choice. Every style has a flag button beside
radio power to open/close missions downward. GPS uses the minimap. Style changes,
mission browsing and minimizing preserve audio power/playback and cabin requests.
The cockpit radio retains all its controls even with a minimal driving widget.

Compact climate adds FPS, average frame milliseconds and game-connection ping.
Readings show a dash until measured and clear when sampling stops. Only the tiny
readout rerenders for those values. The existing render probe publishes at most
twice a second; no extra RAF, ping loop, profiler capture or physics owner is added.
FPS/frame time measure rendered frame cadence, not GPU execution duration.

## Main and garage

Main has Play, Career, Worlds & Social and Settings. Wide landscape uses two halves:
brand/driver progress on the left and menu actions on the right, without a dividing line. Portrait stacks
those areas. Existing background videos, square buttons, selected states and
keyboard/controller legend remain.

Play opens mode/vehicle selection in the existing 3D garage. Quickplay,
Competitive, Sandbox, World Editor, Signal Recon and Swarm Command appear there.
Swarm is marked planned and cannot launch. Signal Recon opens its existing
CAN/interface setup; Back returns to this garage. It opens without a Rust driving
server and cannot be submitted as a mode_join request.

The current garage has role filters above its portrait grid and environment or
Recon CAN controls below it. Teammate cards are centered above the footer; the
selected name/role remains at upper left. The vehicle arrow bar is removed.
Navigation follows visible rows. Chat rests as a launcher and opens for direct
interaction or new messages/player activity. Signal Recon enters its workspace
directly with the selected CAN settings and vehicle profile.

See `MENU_NAVIGATION_AND_CHAT.md` for the current layout, Xbox action chrome,
minimap stability audit, chat lifetime and direct Recon flow.

## Checks

Validation details ship in `validation.json`. Browser checks cover desktop,
landscape phone, small landscape phone and portrait phone; input checks exercise
keyboard activation and injected gamepad polling. They do not certify hardware
controller compatibility or phone GPU frame rates. Existing server/gameplay
limitations remain documented in `ALPHA_UI_AND_LOBBIES.md`.
