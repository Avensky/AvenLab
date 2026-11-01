# Mode first, hero second

The Play flow now has two distinct garage screens. The existing one-canvas
vehicle preview and turntable stay mounted between them.

1. **Game mode:** LB/RB, Q/E, Page Up/Down, or Tab/Shift+Tab selects a mode
   immediately. Clicking or focusing a mode tab selects it too. Directional
   navigation never cycles modes. This screen has no portrait grid or team cards.
2. **Configuration:** Sandbox and World Editor share every entry in `mapCatalog`.
   Their full-width green environment strip is directly above the footer. Focus
   belongs to the entire component; Left/Right changes maps and A/Enter continues.
   Signal Recon puts the shared CAN interface and capture-mode bars in that same
   bottom position. Left/Right moves between those fields and A/Enter cycles a
   field; Down reaches Continue.
3. **Admission:** Quickplay and Competitive wait for the real alpha host to
   assign a match seat. The existing FIFO queue/video background is retained.
   Sandbox and Editor also wait for their capacity slot if occupied. This is the
   current alpha host's admission service, not a new multi-host server directory.
4. **Hero selection:** after admission, the next screen contains the portrait
   grid and role filters, with no mode/configuration controls. A fresh admission
   has an empty hero. The favorite preview becomes a dimmed ghost until an
   explicit portrait selection succeeds. Only an assigned Quickplay/Competitive
   match displays the team strip above the footer. Reconnects retain an already
   locked hero; a fresh mode admission does not.
5. **Deployment:** click/A/Enter confirms a portrait through the existing
   server-validated action, then Deploy waits for the existing spawn acknowledgement.
   Signal Recon remains local-capable in Simulation: Continue opens an unpicked
   hero screen, then Enter Signal Recon copies that hero's CAN identity and opens
   analysis directly. The obsolete setup page is not on this route.

## Directional focus and tabs

- Both sticks, D-pad, arrow keys and numpad 8/2/4/6 navigate the portrait grid
  spatially. Left/Right stays on the current grid line; Up/Down changes grid lines.
- Role filters change only through their tab controls: LB/RB, Q/E, Page Up/Down,
  Tab/Shift+Tab, or direct click. They are excluded from directional rows. After
  filtering away a focused card, focus moves into the new grid.
- Focused portraits grow inside their existing footprint, with a soft spotlight
  and role-colored glow. The yellow selected marker remains independent, so a
  keyboard/controller focus is visible even on an already selected hero.
- Tab is owned by these two selection screens, including after clicking the
  garage. Typing, chat, assisted keyboard and other menu panels retain their own
  input behavior. Controller X / keyboard T still opens chat.

## Favorites and animation ownership

The first valid vehicle in Career → Favorites supplies the mode-screen showroom.
If none is configured, the current showroom vehicle is retained. Showing a
favorite never submits `hero_select` or initializes a match pick. All seven hero
identities still use their existing five chassis, and the same preview/turntable
owner serves both stages. This patch adds no model animation assets; the BRZ GLB
currently has no embedded emote clips.

## Server seat policy

`mode_join` accepts an empty hero string (and defaults an omitted hero to empty).
Empty picks are valid only for reserving seats. They count toward five-player
teams, reconnect reservations and world capacity, but claim no Tank/DPS/Support
role. `hero_select` retains the current role limits. Spawning an unpicked alpha
member is rejected. Older clients that explicitly send a known hero remain
compatible. Competitive/Quickplay still share one alpha match slot; Editor and
Sandbox retain their separate single-world slots.

The test profile now uses one codegen unit, matching the repository's existing
release workaround for generic serde linkage on the current Rust toolchain.

## Minimized HUD audit

The utility dock and icon components are memoized. One isolated fixed HUD layer
holds the three minimized controls above WebGL; individual icons are not each
promoted to their own layer. The minimized faces are opaque, with no backdrop
filter, entry animation or transition on their SVG descendants. The clock has a
stable minimum width and stays below the hub. Map contents remain unmounted while
closed; audio ownership and saved climate state are unchanged.

The layer introduces no socket, telemetry subscription, interval, continuous RAF
or per-frame React state update. Browser checks sample node identity/geometry and
icon pixels during real telemetry and clock changes. These checks cannot certify
an iPhone's GPU/compositor; they address avoidable DOM/layout and blending work.

## FR-S instrument reference

The high-beam lamp is deep blue (`#006bff`), to the right of the speedometer hub
at 77% / 54% of that gauge. VSC SPORT is stacked green (`#b4ee42`) inside the center
RPM gauge, slightly left of its needle hub. VSC OFF remains amber. Confirmed live
cockpit/cluster state still owns illumination; photos are only layout/color
references and do not change control or telemetry behavior.

## Installation

Rebuild **both** the frontend and Rust server and restart them. The server change
is required for unpicked seat admission. The cumulative installer preserves exact
undo bytes and includes the previous menu/chat, portrait, social and cockpit work.
See the package README and validation.json for commands and check results.
