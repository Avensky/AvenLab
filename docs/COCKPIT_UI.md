# Cockpit and centered instruments

The driving HUD puts the three gauges at bottom center. Condition/repair is a
thin line above the cluster, outside the speedometer rim. A pale blue ring around
RPM shows ultimate charge. ABS, TRAC, VSC SPORT and stepped parking brake live in
the optional bottom-right Drive console, sharing controls with the full cockpit.

## Layout and access

Settings → Display or Controller → **Driving layout** selects Standard or
Controller. Standard supplies compact steering and gas/brake/reverse controls.
Controller hides touch driving inputs and the expanded Drive console. Each can
be shown independently in either layout; choosing a layout never disables the
keyboard or gamepad. These are device preferences, not separate physics modes.
Changing layouts releases held touch input without erasing another input source.

Open **Cockpit** from its small screen button, the pause menu, or **F4**.
Controller shoulders switch tabs, D-pad navigates, A/Cross activates, B/Circle
closes. Arrows, Tab, Enter and Space work too. The full panel contains the less
frequent light/wiper/cruise/radio controls, clock and vehicle app links. Signal
Recon never mounts the driving HUD or opens this driving cockpit.

## Drive switches

- ABS uses the existing server-confirmed tire-budget assist. Q remains its shortcut.
- Tap TRAC to toggle traction control. T remains its shortcut. When only TRAC
  is disabled, Rust restores it above 50 km/h and it remains restored below that
  speed until explicitly disabled again.
- VSC SPORT selects a separate profile, retaining the chosen TRAC on/off state.
  Its traction threshold is 15% more permissive. An actual factory yaw controller
  that selectively brakes wheels is not implemented.
- Holding TRAC for more than 3 seconds while stopped requests TRAC + VSC OFF.
  The full cockpit also has an explicit stopped-only action for keyboard and
  controller users. Rust rejects this request above 0.5 m/s. This state remains
  off at speed. Turning the engine off restores the normal assist profile;
  unrelated stale stalk requests cannot reactivate an old mode.
- Parking brake has OFF / 33% / 67% / 100% cable tension. Tap to advance a detent,
  drag up/down, or select a level in the full cockpit. Momentary keyboard B or
  controller B/Circle still gives full rear-brake force while driving. Rust uses
  the maximum of momentary and latched force, bypassing rear ABS for the cable
  brake. The lever can load a running engine without creating reverse drive.
- The manual H gate is assisted, with selectable slots equivalent to dragging.
  Automatic P/R/N/D remains available. Rust gates incompatible park/reverse
  requests at speed. A clutch/torque-curve overhaul remains separate.

FR-S reference: Toyota owner manual, "Using other driving systems", printed
pages 175–178. TRAC OFF and VSC SPORT are distinct states; holding the switch
while stopped turns both off. The speed-triggered TRAC return applies when
only TRAC is off. These UI switch states follow that distinction, while the
underlying simulated assists retain the limits described above.
https://assets.sia.toyota.com/publications/en/om-s/OM18027U/pdf/OM18027U.pdf

## Other cockpit tabs

Lights provide OFF/AUTO/LOW/HIGH and turn indicators. AUTO currently means
engine-linked running lights, pending ambient lighting. Wipers provide
OFF/LOW/MID/HIGH and a 400 ms wash pulse: authoritative adapter state plus a
digital illustration, with GLB wiper rigs and vehicle-specific CAN mappings
remaining separate work.

Cruise ON/OFF, SET, RESUME and CANCEL use a bounded proportional game assist.
SET requires 30 km/h; RESUME requires 20 km/h and a previous target. Brakes,
parking, engine stop and reverse cancel it; driver throttle can override it.
Radio plays a selected local audio file through one lazy browser Audio element,
including while the cockpit is closed. No licensed music or remote streams are
bundled. The clock updates twice a minute. Vehicle apps open existing game menus.

## Instruments and power

Outer speed is 0–160 MPH (33 marks, 5 MPH apart). Inner speed is 0–260 km/h
(53 marks, 5 km/h apart). Both share the exact conversion 1 mile = 1.609344 km;
160 MPH stops at 257.49504 km/h, just before inner 260. Both scales have an open
gap. Unit preference changes the numeric reading, not the dial geometry.

The RPM white band extends before 0 and beyond 9. **RPMx1000** sits lower in the
black interior. The speed LCD is to the right of the hub; the wider lower LCD
shows gear in the reference photo's odometer position. Confirmed engine off or
unavailable telemetry blanks both. Confirmed cranking pulses their illumination;
reduced motion suppresses the pulse.

Fuel/coolant use separate, mirrored hubs toward the right, with equal top/right
and bottom/right insets and all marks inside the frame. Engine off parks fuel
below E and coolant halfway across its own scale. These are needle presentation
states; actual liters/temperature values are retained. Missing readings stay
unavailable. Lamp SVGs and confirmed optional lamp availability are retained,
including the coupe door, TPMS, cruise, high beam, bulb check and steering warning.

## Ultimate charge and damage

`ultimate_fraction` is authoritative, starts at zero, and caps at one. The
current damage source is a chassis-to-chassis ram: a moving vehicle approaching
another vehicle receives the actual condition loss it causes. One percent
condition damage adds one percent charge. Vehicle chassis now collide with each
other as well as the world. Single-player driving does not build an attribution
table. Damage credits use pre-contact vehicle motion and the strongest actual
Rapier contact; the existing impact threshold/cooldown still prevents repeated
substep damage.

Scenery, standing contacts, own damage, fuel/heat changes, and elapsed time do
not award charge. Service and vehicle changes preserve earned charge; spawning
a new vehicle/player lifecycle starts it empty. CTF enemy/team rules and an
ultimate activation/effect are not defined yet. Sandbox attribution currently
counts other players regardless of team. No client input can set earned charge.
Legacy finite NOS still exists in the Rust resource model and Shift/LB shortcut;
it is separate from ultimate and no longer adds a HUD meter/button.

## Ownership and packed protocol

`inputStore` is the sole requested-input owner. One existing sender transmits
optional `cockpit_mask` alongside normal input. Rust owns accepted state and
safety checks. Setup `hud.cockpit_version: 2` enables the revised physical
controls; earlier cockpit servers keep those actions disabled until rebuilt.
ABS remains available through its older vehicle flag.

| Request bits | Meaning |
|---|---|
| 0–1 | Light mode |
| 2–3 | Wiper mode |
| 4–5 | Normal / Sport / TRAC off / both off |
| 6 | Automatic selector |
| 7–10 | Gear: 0=N, 1–6, 7=R, 8=P |
| 11 | Latched parking enabled |
| 12 | Momentary washer |
| 13 | Cruise enabled |
| 14–15 | Cruise action |
| 16–23 | Wrapping u8 request revision |
| 24–27 | Changed control group |
| 30–31 | Parking tension detent 0–3; old enabled boolean with zero means full |

Sport uses the existing TCS vehicle flag for its independent traction request.
Assist state changes only on an explicit assist command. Snapshot bits 24–27
mean cruise active, traction rearmed, parking active, cockpit enabled. Bits
28–29 hold rejection status; 30–31 retain parking tension. Requests stay unsigned
through release/cancel, including when these high bits are set.

The shared reference-counted display sampler remains 20 Hz, only while HUD or
cockpit is mounted and visible, with unchanged values suppressed. Static dial
faces are memoized; needles use transforms; charge updates one SVG stroke offset.
There are no per-gauge animation loops or added physics/network timers. Setup
telemetry availability adds ULTIMATE=64, giving road cars 127 and tank 111.
Raw values remain JSON numbers with packed flags, not a binary telemetry codec.

## Preview and validation

Open `/previews/cockpit.html` after starting the frontend, or the standalone
HTML deliverable. It defaults to the compact HUD; use ZOOM INSTRUMENTS for the
larger gauge review. Standard/Controller and visibility buttons demonstrate both
layouts. The sample ultimate slider is explicitly mock data. Preview telemetry
and acknowledgements are not physics, actual controller polling, or an FPS test.

Automated checks cover exact scale geometry, power/needle states, availability,
static-face reuse, controller routing, touch release, unsigned packed parking
levels, independent Sport/TRAC states, reactivation/reset rules, actual ramming
and scenery damage attribution. Native browser/phone rendering remains for review:
local Chromium is blocked by this environment's socket restriction.

Final automated validation: 174 frontend tests and 62 Rust tests passed with no
failures or skips; ESLint, TypeScript/Vite production build and optimized Rust
release build passed. A live Rust WebSocket check also confirmed calibration,
parking levels, gear/lights/wipers, Sport/TRAC combinations and ignition reset.
