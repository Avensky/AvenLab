# Mobile driver station and optional controls

The instruments sit at top-left, a team/game/general chat area occupies middle-left,
and the cropped steering wheel sits at bottom-left. Gas/brake/reverse controls are
at bottom-right. The right-hand console has independent display, climate, shifter,
parking-brake and assist groups. The ignition key is a separate center-screen pod.
A top-right slot is prepared for a future minimap; no minimap is implemented yet.
Signal Recon never mounts the driving HUD.

## Layout and access

Settings → **HUD** offers a saved Show/Hide choice for each of ten groups:
instruments, wheel, pedals, ignition, display, climate, shifter, parking, assists
and chat. Each HUD group also has Collapse/Expand and Hide buttons. Collapse is
local to the mounted HUD; hiding persists on this device. Restore all HUD groups
also restores the master HUD and optional controls. A small HUD settings/Cockpit
shortcut remains available when groups are hidden.

Standard and Controller layouts retain their independent touch/console master
choices. Hiding a touch source releases its held intent without clearing another
pedal, keyboard or gamepad. Keyboard/controller driving never depends on a visible
button. Optional equipment starts collapsed to preserve the road view. Panels
scroll if the browser is too short to show every expanded group.

The wheel starts 28% below the bottom edge; **Wheel below screen** adjusts 0–55%.
**Steering thumb travel** adjusts the circular travel range from 90–130% (112%
by default), allowing the thumb to pass the rim. Only X controls steering.
Settings → Drivetrain chooses the H-pattern or automatic selector layout; both
retain automatic forward driving and temporary gear overrides.

Open **Cockpit** from its button, pause menu, **F4**, or
**LB/L1 + View/Select** (Console tab). View/Select alone retains the performance
shortcut. Shoulders switch cockpit tabs, D-pad navigates, A/Cross activates and
B/Circle closes. Arrows, Tab, Enter and Space also work. HUD button activation
cannot become a driving brake input.

The electronic display now has fixed-height **RADIO**, **CONTROLS** and **APPS**
pages. Radio reuses the local Audio player and continues playing if its panel is
hidden. Controls include lighting, signals, hazards, ABS/TRAC, CAN logging/live
CAN, dyno, horn, NOS, recovery and a single wipe. Apps open the existing game menus.
The key appears separately, automatically expanded with the engine off and
collapsed once a confirmed start succeeds. The full cockpit has an Ignition tab.

The chat group has Team / Game / General channel tabs. It is a layout shell with
a disabled composer and an explicit disconnected state; no message service or
pretend delivery is implemented. This reserves space for the eventual transport
without adding another fast store or network sender.

## Ignition and climate

| Key position | Authoritative behavior |
| --- | --- |
| OFF | Stops engine; key can be inserted/removed here. |
| ACC | Accessory position; does not request a starter. |
| ON | Powers the instrument LCD and bulb check; keeps an already-running engine running, but cannot start a stopped engine. |
| START | Requests the existing 700 ms crank. A successful start springs back to ON. Releasing before completion aborts the crank. |

Drag the key clockwise through the detents, click it to advance, or choose a
labeled position. START activation from a button/controller pulses for one second;
a dragged key can be held in START. Release, blur, hidden page, menu transition,
disconnect and unmount all release a held starter to ON. The displayed key follows
confirmed telemetry. The old E/controller X/Square engine toggle still works.
Legacy clients that never send a key command retain their existing engine behavior.

Climate controls send temperature (16–30°C), fan (OFF/1/2/3), A/C, recirculation
and front/rear defrost settings. These are confirmed digital adapter states, not
cabin thermodynamics. Changing HVAC cannot replay an earlier START/OFF command.

The local clock is shared by the gear LCD and console and updates twice a minute
only while visible. Optional `snapshot.match_clock` accepts server-owned
`remaining_s` and `phase: regulation | overtime | ended`. The UI does not create
a match timer, timeout, score or winner; the server match system remains future work.

## Wheel and column stalks

The wheel is a memoized vector inspired by the FR-S reference: dark perforated
rim, red stitching and silver lower spoke. Its entire circle is a joystick.
Thumb travel is constrained to a circle; only horizontal position changes steer.
The horizontal travel limit gives full ±1 input and vertical motion only moves the thumb.
Release centers the touch source. Keyboard/gamepad input also rotates the wheel,
with a short CSS transition rather than a new animation loop. Visual lock is
±135°, a HUD choice rather than a claim about factory lock-to-lock geometry.

Stalks are smaller and stay inside the rim as it turns; their rods remain fixed. Angles are measured counterclockwise from
3 o'clock. Drag up/down, or focus and use arrow keys. Tap rotates a mode.

| Stalk | Angle | Up / Down | Tap |
| --- | --- | --- | --- |
| Left lights/signals | 120° | Right blinker / left blinker | OFF → AUTO → ON |
| Right wipers | 60° | 400 ms washer / one timed wipe | OFF → SLOW → MID → HIGH |
| Lower-right cruise | 315° | RES/+ / SET/−; holding repeats | Cruise ON/OFF |

Escape cancels the selected turn signal or cruise. The full cockpit retains
explicit HIGH beam, wipe and cruise actions for controller access. Single wipes
last 850 ms; washing requests 1.8 s of wiping after the rotary mode is considered.
These states do not animate a vehicle GLB without that model's wiper adapter.
AUTO headlights remain engine-linked pending an ambient-lighting implementation.

Cruise uses a bounded proportional game assist. SET requires 40 km/h; RESUME
requires 32 km/h and a saved target. With cruise active, the stalk changes the
target by 1.6 km/h (approximately 1 MPH) per action, clamped to 40–200 km/h.
Brakes, parking, reverse, engine stop and speed below 32 km/h cancel active cruise.
Driver throttle overrides it. These are game limits, not a certified factory ECU.

Reference for the physical lever directions and speed adjustment: Toyota FR-S
2015 owner manual, “Using the driving support systems” and “Windshield wipers”.
https://assets.sia.toyota.com/publications/en/om-s/OM18027U/pdf/OM18027U.pdf

## Transmission and assist switches

The H-pattern and automatic choices belong only in Settings → Drivetrain;
there are no mode toggles beside the knob. The H gate uses matching percentage
coordinates for lines/slots, including on non-square screens. Dragging anywhere
within the middle lane (y=39–63%) immediately selects N, without repeated requests
while the thumb stays in that band. Dropping into another slot selects that gear.

Both layouts request automatic forward operation. A forward gear tap (H slot,
PageUp/PageDown, A/Cross or R3) supplies a 0.75-second override, then the existing
automatic up/downshift rules resume. No clutch or manually locked forward gear is
required. Selecting N remains neutral under throttle until a driving gear is
selected. P/R retain the existing speed gates. A visible recorder keeps A/Cross
priority; the old dyno fallback remains when a gear-down action is unavailable.
Legacy clients can still request the earlier locked manual mode explicitly.

The parking brake remains independent of the gear selector: a forward gear tap
cannot release its cable tension. P locks through its gear selection rather than
raising the separate lever. The rest pose is tapered/foreshortened toward the
background (projected -115°); full application rises toward -75°. These are screen
projections of floor/up axes, not a claim that perpendicular 3D lines must appear
90° apart in the image. Tap, drag or choose OFF / 33% / 67% / 100%. Keyboard B and
controller B/Circle still supply momentary full cable force. Rust takes the
maximum of latched and momentary force and bypasses rear ABS for it.

ABS uses the existing tire-budget assist; Q remains its shortcut. T toggles TRAC.
TRAC OFF rearms above 50 km/h and stays rearmed until explicitly disabled again.
VSC SPORT is separate and retains the chosen TRAC state, with a 15% more permissive
traction threshold. Holding TRAC for over 3 seconds while stopped requests TRAC +
VSC OFF; an explicit cockpit action supplies controller access. Rust rejects it
above 0.5 m/s. Engine stop restores Normal. This is not factory selective-wheel yaw
stabilization; no such physical VSC model is implemented.

## Instruments and resource rings

Speed scales remain evenly spaced open arcs: 0–160 MPH and 0–260 km/h using the
exact conversion 1 mile = 1.609344 km. RPM reaches 9 with extra white band before
and after the scale; the lowered label reads **RPMx1000**. The right LCD shows
speed; the wider lower LCD shows gear and local time. OFF/unavailable blanks both,
ON powers them and confirmed cranking pulses them. Reduced motion disables pulses.

Fuel and coolant use 64-unit quarter arcs, 60-unit needles and separate mirrored
hubs at (121,79) and (121,121) in the 200-unit parent disc. Their parent also grows from 33% to 36% of the cluster. All marks remain inside the
rim with equal top/right and bottom/right insets. Engine off parks fuel below E
and temperature halfway across its scale without changing the physical values.

| Ring | Location | Data |
| --- | --- | --- |
| NOS, pale blue | Outside RPM | Confirmed finite `boost_fraction`, highlighted only during confirmed boost |
| Condition, orange/red | Outside speedometer | Authoritative `condition`; redder below 75% |
| Hero ultimate, blue | Outside fuel/coolant | `ultimate_fraction`; lightning and glow at 100% |

Ultimate remains credited only from authoritative damage dealt, currently actual
chassis ramming. Own damage, scenery, fuel, heat and time cannot award charge.
No client input awards it. Service/vehicle changes retain it. Team/CTF rules and
an activation/effect are future work. NOS remains separate and finite.

## Packed protocol and update owners

`inputStore` owns requests, the existing 60 Hz sender owns transport, Rust owns
accepted state, physics substeps remain 120 Hz and snapshots target 60 Hz. The
HUD/full cockpit share one reference-counted, visible-only 20 Hz display sampler.
The root mounts its shared sampler only when a wheel/cockpit group needs it;
Dashboard owns its own reference while visible. All groups hidden stops both.
Static gauge faces and wheel artwork are memoized. Rings update one stroke offset;
there are no extra physics, network or per-gauge animation loops.

Setup advertises `hud.cockpit_version: 4`; v4 enables assisted forward gear taps.
Version 3 adds key/climate/timed-wipe controls and version 2 the basic physical
controls. The UI disables actions missing from the server calibration. `cockpit_mask` keeps its existing
u32 state/revision layout and adds commands 8=cruise up, 9=cruise down, 10=single wipe and 11=forward gear
override. Unchanged repeated input packets cannot renew that override.

Optional `cabin_mask` is a packed u16 in the existing JSON packet:

| Bits | Request / snapshot |
| --- | --- |
| 0–3 | Temperature minus 16, clamped to 0–14 |
| 4–5 | Fan 0–3 |
| 6/7/8/9 | A/C / recirculate / front defrost / rear defrost |
| 10–11 | Key OFF/ACC/ON/START |
| 12 | Key inserted |
| 13 | Request only: explicit key command; ordinary HVAC clears this bit |
| 14 | Snapshot only: key control has overridden legacy engine toggle |
| 15 | Snapshot only: temporary wipe cycle active |

Snapshots also add optional `cruise_target_kph`. Older input packets remain valid.
JSON numbers plus packed flags are retained; this is not a binary telemetry codec
or an assertion of any manufacturer-specific CAN identifier mapping. See the
[store reference](../frontend/src/store/README.md) for responsibilities and rates.

## Preview and validation

`/previews/cockpit.html` and the standalone HTML use clearly labeled sample
telemetry and simulated acknowledgements. They demonstrate key stages, rings,
wheel/stalks, climate, shifter, HUD visibility and real HUD/drivetrain settings without GLB downloads.
Preview preferences use separate storage names and do not overwrite game settings.
They are UI previews, not physics, CAN traces, controller polling or FPS benchmarks.

Checks include the scale/power states, independent rings, wheel ownership/release,
stalk gestures/repeat cleanup, ignition/cabin packing, shared gate geometry,
controller shortcuts and existing input routing. Rust tests include actual
start/abort/stop behavior through physics, HVAC isolation, timed wipes and cruise.
Native browser/phone rendering remains unverified: local browser sockets and
cloud-browser local-file navigation are blocked in this environment. Rebuild and
restart Rust and rebuild the frontend together. Validation totals are in APPLY.md.
