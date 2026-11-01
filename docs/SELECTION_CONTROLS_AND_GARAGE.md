# Selection controls, garage palettes and launch traction

Based on Git commit `368d2fe5f7da3b727612be79c69e7d20256740bc`.
Rebuild and restart **both** the frontend and Rust server. The cumulative ZIP
includes the preceding mode-first, chat, social-world and cockpit updates.

## Selection inputs

| Screen | Mode / role tabs | Secondary field | Directional input | A / Enter |
| --- | --- | --- | --- | --- |
| Game mode | LB/RB, Q/E, Page Up/Down, click | — | Sandbox/Editor: Left/Right changes environment; Up/Down does nothing | Continue with current options |
| Signal Recon mode | Same game-mode controls | LT/RT, 1/3, numpad 1/3, field click | Left/Right edits the active CAN field | Continue to unpicked heroes |
| Hero selection | LB/RB, Q/E, Page Up/Down, filter click | — | Both sticks, D-pad, arrows, numpad 8/2/4/6 move spatially in portraits | Lock preview; press again to advance |

The footer remains clickable but is excluded from the required selection path.
A applies to the current options even when focus is on the header or a strip
arrow. Environment strips have no focus/hover selection cue because there is
only one directional field. Recon highlights its active field because there are
two. Trigger changes never edit a field's value. Game modes still select as soon
as their tab changes. Role filters are excluded from directional rows.

Plain Tab and Shift+Tab do not navigate or cycle UI anywhere in the app. The
existing approved tab keys remain available. Ctrl/Alt/Meta browser shortcuts and
focused text editing are left to their current owners. Chat and assisted keyboard
keep their existing controller navigation; the new screen-level A action cannot
submit a hero while chat owns input. No extra gamepad polling loop was added.

## Preview and confirmed hero

Fresh admission starts with both `hero` and `previewHero` empty. The initial
showroom model is a 23% opacity ghost only on that unpicked hero screen. Mode
selection and gameplay use authored full-opacity body materials; authored glass
keeps its original transparency.

Portrait focus, pointer hover and directional movement set only `previewHero`.
They load a fresh full-opacity clone immediately, without sending `hero_select`.
First A/click locks that hero through server validation. A again on the same
preview deploys (or opens configured Recon). If another portrait is previewed,
A selects it instead of deploying the old pick; another A advances. Focused
portraits retain grow/role glow; the confirmed hero retains soft white glow and
a white top-right diamond without a duplicate colored selection border.

Back first clears preview/confirmation and returns to the ghost while keeping
the admitted seat. `hero_select` with an empty hero clears a pre-deployment pick
on Rust without releasing the seat. A second Back cancels admission and returns
to game modes. Clearing a deployed alpha member is rejected by Rust. Reconnect hydration runs
once per admission, so a delayed lobby view cannot restore a choice after Back. An in-game
Change Hero overlay's Back simply returns to the running game.

All five vehicle models now own their cloned materials, including BRZ, AE86 and
Tank. Ghost changes and disposal cannot mutate the GLTF loader cache or a live
vehicle. Ghost-to-full transitions replace the preview clone; geometry and
textures still use the existing shared assets.

## Garage lighting

The current lighting controls and reflection correction are documented in
[Garage lighting and effects](GARAGE_LIGHTING_EFFECTS.md). Settings → Garage now
owns bloom, brightness, exposure and reflection controls. Colors follow the
shared interface theme; high contrast reduces white emission and disables bloom.
The reflection snapshot is themed before the first cube capture.

## FR-S fuel/temp telltales and traction

The fuel/temp gauge has three vertically stacked indicators, left of the needle
hubs at x=48%: amber TRAC / OFF at y=30%, amber skid-car / OFF at y=50%, and green
VSC / SPORT at y=72%. The existing blue high beam stays beside the speedometer.
Confirmed live server telemetry controls illumination.

Tap TRAC or keyboard T to arm a one-launch traction-off state. Only the skid-car
OFF indicator illuminates. Rust watches grounded driven-tire saturation and the
existing solver's Slide state. The current longitudinal model clamps drive
impulse before Slide classification, so it must also observe drive demand above
available grip using the same final contact loads. After the first such event,
120 ms of grounded grip recovery rearms TCS. Airborne time, speed and elapsed
time without a slip event cannot rearm it.

Hold TRAC or T for 3.1 seconds while stopped to request persistent traction off.
Rust rejects the stopped-only command above 0.5 m/s. Both amber indicators show;
taps, recovered grip and speed cannot clear this engine-session latch. Confirmed
engine shutdown restores Normal/TCS. Sport can remain selected while the latch
is active. This reuses the existing tire-budget assist; factory selective-wheel
VSC yaw stabilization and a full wheel-angular-slip model remain future work.

`hud.cockpit_version` is now 8. In `cockpit_mask` snapshots, bit 14 means temporary
launch-off and bit 15 means persistent traction-off. Requests retain the existing
bits 14–15 cruise command layout, so request assembly clears those snapshot bits
before applying a new command. Version 7's exact parking-brake fraction and all
other packet owners/rates are unchanged.

## Validation scope

The package's `validation.json` records current tests, builds, browser checks and
installer checks. Browser automation uses a disposable local Rust server, software
WebGL and emulated controller/mobile viewports. Physical CAN captures and phone
GPU/FPS require device testing. The patch adds no world-capacity claim or hosting
subscription requirement.
