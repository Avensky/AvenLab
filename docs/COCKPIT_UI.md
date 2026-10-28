# Driver station and electronic console

The three instruments and the analogue steering wheel form the bottom-left
driver station. The bottom-right stack is the electronic display, clock/hazards
and climate strip, then the manual shifter, cable handbrake and assist switches.
The full cockpit reuses these components. Signal Recon never mounts them.

## Layout and access

Settings → Display or Controller → **Driving layout** selects Standard or
Controller. Standard supplies a wheel and gas/brake/reverse pedals. The Sticks
option replaces the gas/reverse pedals with a throttle joystick and keeps a
separate brake. Controller hides optional touch controls and the expanded console.
Each visibility option is independent; keyboard/gamepad input remains available.
Layout changes release the hidden touch source without erasing another device.

Open **Cockpit** from its small button, the pause menu, **F4**, or
**LB/L1 + View/Select**. The controller shortcut opens the Console tab. View/Select
alone retains its performance-overlay shortcut. In the full cockpit, shoulders
switch tabs, D-pad navigates, A/Cross activates and B/Circle closes. Arrows, Tab,
Enter and Space also work. Controls cannot leak driving input into a menu.

The electronic display has fixed-height **IGNITION**, **CONTROLS** and **APPS**
pages. Controls include lighting, blinkers, hazards, ABS/TRAC, CAN logging/live
CAN, dyno, horn, NOS, recovery and a single wipe. Apps open Cockpit, Settings,
Radio, Lights, Wipers, Cruise, Missions, Career, Debugger, Vehicles, Recorder,
Terminal and Pause. Existing applications retain their existing behavior.

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
The horizontal rim gives full ±1 input and vertical motion only moves the thumb.
Release centers the touch source. Keyboard/gamepad input also rotates the wheel,
with a short CSS transition rather than a new animation loop. Visual lock is
±135°, a HUD choice rather than a claim about factory lock-to-lock geometry.

Stalks stay fixed as the rim turns. Angles are measured counterclockwise from
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

The manual H gate uses matching percentage coordinates for both lines and slots,
including on a non-square screen. R/1/3/5 sit above N/2/4/6. Drag the knob or select
a slot. Automatic P/R/N/D is always available. The expanded HUD initially selects
manual on a v3 server if the player has not made a cockpit request. Hidden console
and legacy clients retain automatic behavior. This remains an assisted selector;
a clutch and full torque-curve model are separate work.

PageUp/PageDown or A/Cross and R3 shift a manual through N and 1–6. Reverse uses
its explicit gated slot. When the recorder is visible, A/Cross retains recording
priority. In automatic mode, R3 retains the existing dyno shortcut.

The handbrake sits left of the shifter. Its long lever starts horizontal and
raises up to 66°. Tap, drag, or choose OFF / 33% / 67% / 100% cable tension.
Keyboard B / controller B/Circle supplies momentary full cable force while driving.
Rust takes the maximum of latched and momentary force and bypasses rear ABS for it.
Park/reverse direction changes remain gated by actual speed.

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

Fuel and coolant now use larger 52-unit quarter arcs and separate mirrored hubs
at (130,70) and (130,130) in the 200-unit parent disc. All marks remain inside the
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
Static gauge faces and wheel artwork are memoized. Rings update one stroke offset;
there are no extra physics, network or per-gauge animation loops.

Setup advertises `hud.cockpit_version: 3`; version 2 retains basic cockpit actions,
with v3-only climate/key/stalk actions disabled. `cockpit_mask` keeps its existing
u32 state/revision layout and adds commands 8=cruise up, 9=cruise down, 10=single wipe.

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
wheel/stalks, climate, shifter and optional layout controls without GLB downloads.
They are UI previews, not physics, CAN traces, controller polling or FPS benchmarks.

Checks include the scale/power states, independent rings, wheel ownership/release,
stalk gestures/repeat cleanup, ignition/cabin packing, shared gate geometry,
controller shortcuts and existing input routing. Rust tests include actual
start/abort/stop behavior through physics, HVAC isolation, timed wipes and cruise.
Native browser/phone rendering remains unverified: local browser sockets and
cloud-browser local-file navigation are blocked in this environment. Rebuild and
restart Rust and rebuild the frontend together. Validation totals are in APPLY.md.
