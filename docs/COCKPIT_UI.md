# Mobile driver station and optional controls

The instruments sit at top-left and the cropped steering wheel sits at bottom-left. Gas/brake/reverse controls are
at bottom-right. The right-hand console has independent display, climate, shifter,
parking-brake and assist groups. One rotary ignition key sits low beside the right-hand console, leaving the
vehicle center clear.
A collapsible top-right minimap plots the loaded authoritative roads and routes to a waypoint. It adds no second 3D render.
Signal Recon never mounts the driving HUD.

## Layout and access

Settings → **HUD** offers saved Show/Hide choices for ten groups, including
minimap. Visibility and Restore HUD remain in the menu; no generic close/title
bars appear over the road. Radio, climate and map have their own compact
minimize controls. Instruments, wheel, pedals and ignition have no close bar.

Standard and Controller layouts retain independent touch/console master choices.
Hiding a touch source releases its held intent without clearing another pedal,
keyboard or gamepad. Keyboard/controller driving never depends on a visible
button. The right stack is radio, climate, parking/assists beside the full-height
shifter, then pedals at the bottom. Collapsed radio is a label row plus controls;
collapsed climate is a single clock/hazards/ambient-temperature row. The basic
radio never requires scrolling.

The wheel starts 28% below the bottom edge; **Wheel below screen** adjusts 0–55%.
**Steering thumb travel** adjusts the circular travel range from 90–130% (112%
by default), allowing the thumb to pass the rim. Only X controls steering.
Settings → Drivetrain chooses the H-pattern or automatic selector layout; both
retain automatic forward driving and temporary gear overrides.

Open **Cockpit** from the radio Apps page, pause menu, **F4**, or
**LB/L1 + View/Select** (Console tab). View/Select alone retains the performance
shortcut. Shoulders switch cockpit tabs, D-pad navigates, A/Cross activates and
B/Circle closes. Arrows, Tab, Enter and Space also work inside menus. Pointer
interaction with HUD controls prevents browser focus rather than selecting a
button. The configured driving brake key (Space by default) is intercepted before
a focused HUD button can turn it into a click. Menu activation remains separate.

The electronic display expands to **RADIO**, **CONTROLS** and **APPS**, plus
shortcuts opening the actual Settings and Keyboard tabs. Radio reuses one Audio
player and continues when hidden. Local filenames in `Artist - Song.ext` form
supply labels; this is not ID3 parsing or an online station service. Controls
include lighting, signals, hazards, ABS/TRAC, CAN logging/live CAN, dyno, horn,
NOS, recovery and single wipe. Apps open game menus, GPS and driving views.
Ignition remains visible when running. The full Cockpit retains its Ignition tab.

The disconnected chat shell has been removed from the HUD and Settings. Older
saved chat visibility is discarded by preference validation. Equipment can scroll
in a short viewport while the pedals retain a separate, nonshrinking bottom row.
The expanded map stays in the safe-area top-right corner. It is smaller than the
wheel (normally 96–176 px, 80 px on narrow portrait screens), capped by the right
console's width. It paints above the console on short screens and never pushes
pedals or other controls. The separate Cockpit GPS page retains a larger map.
Mission title/objective and its optional waypoint live inside the map; tapping a
supplied objective routes GPS there. `navigationStore.setMission` is a session-only
adapter entry point, cleared by the mission owner on completion/exit. Today's
sandbox has no active match objective and shows SANDBOX / FREE DRIVE instead.
The optional server match clock is in the map header, including when minimized.

Engine/resource and connection notices use the radio's existing subtitle line,
including when minimized. A notice temporarily replaces artist/station text;
the song title and transport remain visible. Clearing it restores the subtitle.
There is no floating status label around the instruments. Notice subscriptions
select only the resulting text, so position-only updates do not redraw the radio.

## Ignition and climate

| Key position | Authoritative behavior |
| --- | --- |
| OFF | Stops engine; key can be inserted/removed here. |
| ACC | Accessory position; does not request a starter. |
| ON | Powers the instrument LCD and bulb check; keeps an already-running engine running, but cannot start a stopped engine. |
| START | Requests the existing 700 ms crank. A successful start springs back to ON. Releasing before completion aborts the crank. |

There are four 45° detents: OFF, ACC, ON and START, with tangent labels.
The key follows confirmed telemetry when idle and the held position while turning.
The old E/controller X/Square engine toggle still works.
Legacy clients that never send a key command retain their existing engine behavior.
The HUD and full Cockpit use one key button, without a second starter or clickable
position labels. Tap the key to switch OFF. Hold to advance at 250 ms to ACC,
550 ms to ON and 850 ms to START, starting from the current position. START stays
held until release, then springs back to ON. Release at ACC/ON retains that stage.
The existing Rust 700 ms crank remains authoritative; a short START hold can abort
before the engine starts. Holding while already running is permitted without
forcing a shutdown/restart. A clockwise drag also selects the key's detents.
Focus loss, pause, disconnect and unmount release START and cancel the hold timer.
Inside menus Space/Enter can hold the key; in the driving HUD Space always brakes.
Arrow/Home/Delete access remains, and an Arrow/End START action retains a bounded
one-second pulse for controller menu navigation that supplies only an activation.


Expanded climate has three round knobs: airflow/recirculation, fan/rear
defrost and temperature/A/C. Fan has OFF/1/2/3/4; airflow has FACE, FACE/FEET,
FEET, FEET/DEF and DEFROST. Defrost airflow requests outside air. All temperature
labels use Fahrenheit; packed cabin temperature remains 16–30°C. Ambient comes
from the existing Rust resource configuration, sent once at setup; unavailable
ambient shows a dash. Controls send A/C, recirculation and front/rear defrost settings. These are confirmed digital adapter states, not
cabin thermodynamics. Changing HVAC cannot replay an earlier START/OFF command.

The local clock is shared by the gear LCD and console and updates twice a minute
only while visible. Optional `snapshot.match_clock` accepts server-owned
`remaining_s` and `phase: regulation | overtime | ended`. The UI does not create
a match timer, timeout, score or winner; the server match system remains future work.

## Wheel and column stalks

The wheel is a memoized vector inspired by the FR-S reference: dark perforated
rim, red stitching and silver lower spoke. Its painted rim/spokes/hub are a joystick. Transparent gaps pass through to the
stalks behind it. The wheel stays visually above the stalks; SVG painted regions
provide hit targets without invisible rectangular blockers.
Thumb travel is constrained to a circle; only horizontal position changes steer.
The horizontal travel limit gives full ±1 input and vertical motion only moves the thumb.
Release centers the touch source. Steering transforms update a separate rotor,
so axis input cannot redraw the stalk controls. Keyboard/gamepad input also rotates the wheel,
with a short CSS transition rather than a new animation loop. Visual lock is
±135°, a HUD choice rather than a claim about factory lock-to-lock geometry.

Stalks are smaller and stay inside the rim as it turns; their rods remain fixed. Angles are measured counterclockwise from
3 o'clock. Drag clockwise for up and counterclockwise for down, use the
small tangent-labeled step targets, or focus and use arrow keys. The actuator
springs to center for wipers/cruise. The turn signal holds Left / Off / Right;
clockwise advances toward Right and counterclockwise toward Left, through Off.
Labels are tightened along their tangent. Tap the center cap to rotate its mode.
Cruise is at 305°, reaching 32% of wheel diameter. Its step targets are spaced
18° each side (a 36° arc) so the lower target clears the painted lower wheel spoke.
A small wheel bottom inset keeps the targets reachable at the default crop.
Saved wheel drop and painted-wheel click-through remain. Direction buttons and
cap drags hold their pulled position until pointer/key release. Cruise repeats
adjustments every 350 ms while held. Washer stays requested for the full hold
without a fixed cutoff; release, focus loss or a blocked UI clears it. Wipe-down
requests one cycle while its lever remains pulled. Programmatic/controller clicks
without a physical hold retain a short pulse. Turn signals continue to latch.


| Stalk | Angle | Up / Down | Tap |
| --- | --- | --- | --- |
| Left lights/signals | 120° | Right blinker / left blinker | OFF → AUTO → ON |
| Right wipers | 60° | 400 ms washer / one timed wipe | OFF → SLOW → MID → HIGH |
| Lower-right cruise | 340°, 35% reach | RES/+ / SET/−; holding repeats | Cruise ON/OFF |

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

Gear-number targets are momentary actions, with a brief press flash and no
latched selected style. `aria-current` reports the actual position accessibly.
The H knob follows authoritative automatic gear telemetry with a 260 ms browser
animation through the neutral lane. A 6→1 change crosses the horizontal lane
directly, without fabricated intermediate gear requests. Reduced motion snaps
to the final position. Dragging cancels that animation. Both layouts request automatic forward operation. A forward gear tap (H slot,
PageUp/PageDown, A/Cross or R3) selects a gear at idle and preserves it. Applying throttle starts a 0.75-second
loaded trial before automatic up/downshifts resume. Low-speed downshifts require
throttle demand; releasing the accelerator does not restart an idle gear. No clutch or manually locked forward gear is
required. Selecting N remains neutral under throttle until a driving gear is
selected. P/R retain the existing speed gates. A visible recorder keeps A/Cross
priority; the old dyno fallback remains when a gear-down action is unavailable.
Legacy clients can still request the earlier locked manual mode explicitly.

The parking brake remains independent of the gear selector: a forward gear tap
cannot release its cable tension. P locks through its gear selection rather than
raising the separate lever. The rest pose is tapered/foreshortened toward the
background (projected -115°); full application rises toward -75°. These are screen
projections of floor/up axes, not a claim that perpendicular 3D lines must appear
90° apart in the image. Hold the lever to build its three applied detents: the
first after 250 ms, then one every 300 ms, reaching full at 850 ms. Release keeps
the chosen tension; a quick tap releases it fully. Dragging and direct level
targets remain available. Inside menus Space/Enter holds work the same way, with
no keyboard repeat dependence; in the driving HUD Space always brakes. Focus loss, pause, disconnect and unmount cancel the charging
timer, retaining deliberate latched tension. Keyboard B and controller B/Circle
still supply momentary full cable force. The base ellipse leans with the receding
OFF handle. Three slim four-sided diamonds fill from bottom to top. The empty
stack means Off; full strength fills every diamond. There is no permanently empty
OFF diamond. Applied diamonds glow blue; empty diamonds have dashed outlines. There are no visible percentage
numbers or BRAKE label on the lever: the dashboard owns that warning. The lever
has no focus/pressed box; keyboard focus inside menus brightens the diamonds. TRAC, ABS
and VSC SPORT sit below the brake, in that order, left of the shifter. Rust takes the
maximum of latched and momentary force and bypasses rear ABS for it.

ABS uses the existing tire-budget assist; Q remains its shortcut. T toggles TRAC.
TRAC OFF rearms above 50 km/h and stays rearmed until explicitly disabled again.
VSC SPORT is separate and retains the chosen TRAC state, with a 15% more permissive
traction threshold. Holding TRAC for over 3 seconds while stopped requests TRAC +
VSC OFF; an explicit cockpit action supplies controller access. Rust rejects it
above 0.5 m/s. Engine stop restores Normal. This is not factory selective-wheel yaw
stabilization; no such physical VSC model is implemented. The TRAC icon and label
share one vertically stacked content wrapper.

## Instruments and resource rings

Speed scales remain evenly spaced open arcs: 0–160 MPH and 0–260 km/h using the
exact conversion 1 mile = 1.609344 km. RPM reaches 9 with extra white band before
and after the scale; the lowered label reads **RPMx1000**. The right LCD shows
speed; the wider lower LCD shows gear and local time. OFF/unavailable blanks both,
ON powers them and confirmed cranking pulses them. Reduced motion disables pulses.

Fuel and coolant use 64-unit quarter arcs, 60-unit needles and separate mirrored
hubs at (121,79) and (121,121) in the 200-unit parent disc. The parent returns to
33% of the cluster while these larger inner dials remain unchanged. All marks remain inside the
rim with equal top/right and bottom/right insets. Engine off parks fuel below E
and temperature halfway across its scale without changing the physical values.

| Ring | Location | Data |
| --- | --- | --- |
| NOS, pale blue | Outside RPM, ending at the 7.5 mark | Confirmed finite `boost_fraction`, highlighted only during confirmed boost |
| Condition, orange/red | Outside speedometer | Authoritative `condition`; redder below 75% |
| Hero ultimate, blue | Outside fuel/coolant, mirroring the condition arc | `ultimate_fraction`; lightning and glow at 100% |

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
Static gauge faces and wheel artwork are memoized. Instrument groups subscribe
only to their own values; GPS-only position updates do not commit dashboard
updates. A React Profiler regression checks 20 position projections with zero
extra dashboard commits. Rings update one stroke offset;
there are no extra physics, network or per-gauge animation loops.

Setup advertises `hud.cockpit_version: 5`; v5 enables airflow/fan4 and v4
enables assisted forward gear taps.
Version 3 adds key/climate/timed-wipe controls and version 2 the basic physical
controls. The UI disables actions missing from the server calibration. `cockpit_mask` keeps its existing
u32 state/revision layout and adds commands 8=cruise up, 9=cruise down, 10=single wipe and 11=forward gear
override. Unchanged repeated input packets cannot renew that override.

Optional `cabin_mask` is a packed u32 (v5 extends the earlier u16) in the existing JSON packet:

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
| 16–18 | Airflow 0–4 (v5) |
| 19 | Fan 4 flag; bits 4–5 retain lower fan modes (v5) |

Snapshots also add optional `cruise_target_kph`. Older input packets remain valid.
JSON numbers plus packed flags are retained; this is not a binary telemetry codec
or an assertion of any manufacturer-specific CAN identifier mapping. See the
[store reference](../frontend/src/store/README.md) for responsibilities and rates.

## GPS and driving views

Open MAP at top-right or Cockpit → GPS. Click/tap a road for a snapped waypoint,
use GPS for a point ahead, or Clear. The memoized SVG road layer uses static
`map.collider_chunks` road/intersection AABBs, not city GLBs. A bounded road graph
(maximum 1,024 segments) routes along intersecting centerlines. The SVG only mounts roads in an overscanned view region, refreshed when its
coarse cell/zoom changes. It covers loaded
road data, not an entire streamed world or a lane-aware navigation mesh. Nearby
routes require both ends within 80 m of a known road. A vehicle arrow uses the
existing local 20 Hz position/yaw projection; no additional transport loop exists.

**F6** cycles chase → first-person → bird's-eye; radio Apps also selects each view.
First-person mounts are approximate per car/tank and depend on model interiors.
Bird's-eye follows position with a world-aligned offset. **F7** enters/exits the
inspection view; Escape or controller B returns to driving. The inspector orbits
the interpolated chassis and offers suspension, collider and handling diagnostic
presets. Entering releases driving inputs; leaving restores diagnostic settings.
Steering-input sensitivity is editable. Authoritative spring/collider/handling
parameters are read-only because Rust has no live physical tuning endpoint yet.

## Driveline and radio updates

Every current vehicle uses its configured six forward ratios. Effective final
reduction is calibrated from wheel radius, configured top speed and 82% redline
in sixth, so the last upshift occurs before the configured speed. Drive force
now follows the selected ratio, a bounded torque curve and a soft RPM limiter.
The lower body damping is supplemented by one planar rolling/aerodynamic load
in the existing force accumulator. Healthy full-throttle equilibrium matches
configured speed without a hard velocity clamp or a second tire solver. NOS,
fuel/heat/damage derating and ABS/TCS still act through their existing owners.
This is a simulation calibration, not factory ECU/CAN gear-ratio documentation.

Rust regression checks all six configured vehicles in a healthy one-dimensional
driveline test. A real tire-solver FR-S rolling-road test reached sixth at
61.795 m/s against its configured 62 m/s. The fleet test isolates degradation. The FR-S test runs fuel and heat normally,
finishing with 29.03 L and 98.27°C after two minutes of full throttle. Longer
full-load driving can still lose performance through fuel, heat or damage.

The compact radio always exposes previous/replay, play/pause, next, restart,
source and a volume dial. Dial-center toggles mute. Source accepts up to 100 local
files, with one Audio owner and one active object URL. Previous rewinds after
three seconds; otherwise it selects the previous file. End of a track advances
to the next queued file. Track labels are filename-derived; no online station or
ID3 lookup is fabricated. No playback progress timer is added to the HUD.

## Preview and validation

`/previews/cockpit.html` and the standalone HTML use explicitly labeled sample
telemetry, sample road boxes and simulated acknowledgements. They demonstrate
key stages, rings, wheel/stalks, three climate knobs, animated shifter, GPS and
real HUD/drivetrain settings without GLB downloads. Preview preferences use
separate names and never overwrite game settings. They are UI previews, not
physics, CAN traces, native 3D camera validation or FPS benchmarks.

Checks cover independent arcs, knob/key packing, source release, H-lane animation,
GPS intersections/disconnected routes, camera transforms, inspection restoration
and existing input routing. Rust tests and a live optimized-server WebSocket
check cover real start/abort/stop, extended climate, wiping and gear overrides.
Native browser/phone rendering remains unverified in this environment. Rebuild
and restart Rust together with the frontend. Validation totals are in APPLY.md.
