# Mobile driver station and optional controls

The instruments sit at top-left and the cropped steering wheel sits at bottom-left. Gas/brake/reverse controls are
at bottom-right. The right-hand console has independent display, climate, shifter,
parking-brake and assist groups. One rotary ignition key sits low beside the right-hand console, leaving the
vehicle center clear.
A collapsible top-right minimap plots the loaded authoritative roads and routes to a waypoint. It adds no second 3D render.
Signal Recon never mounts the driving HUD.

## Layout and access

Settings → **HUD** owns the visibility list. Cockpit → **Research** links to it
and to every existing cockpit page; its only direct controls are CAN LOG, LIVE
CAN and DYNO. Returning from HUD settings restores the Research page. Showing a group changes the interface only;
it does not activate that vehicle system. Hiding a held touch control releases
its own input source. Keyboard/gamepad input and another held source remain intact.

The lower-right stack is radio, the optional climate unit with its centered
emergency button, a parking-brake/shifter row, then the assist/pedal row. The parking lever
and shifter are peers with the same 140 px height. The HUD defaults to three silver assist switches left of the pedals. A saved
expanded bank remains available from Cockpit Drive.
On narrow portrait displays the enlarged mechanical row clears the wheel,
while assists and pedals retain one bottom row. The radio keeps its
existing expand control; climate has no expand/collapse arrows.

Cockpit → **Climate** contains all HVAC controls, a **COMPACT HUD / FULL HUD**
choice, a live preview and driving-HUD visibility switches. Compact removes
the dials and restores the round emergency-light switch in the clock strip.
The entire unit defaults hidden. Climate Show/Hide controls the clock, hazard
button and knobs together; the inner hazard preference cannot reopen it. The cockpit Climate page remains available when
its driving widget is hidden. Its emergency switch is centered, round and 24 px (80% of the previous size); the
radio and climate unit share a silver frame. The header has no hazard duplicate.

Standard and Controller layouts retain independent touch/console master choices.
Radio playback continues when its widget is hidden. Ignition, gauges, wheel and
pedals do not add title bars over the driving view.

The wheel starts 28% below the bottom edge; **Wheel below screen** adjusts 0–55%.
**Steering thumb travel** adjusts the circular travel range from 90–130% (112%
by default), allowing the thumb to pass the rim. Only X controls steering.
Settings → Drivetrain chooses the H-pattern or automatic selector layout; both
retain automatic forward driving and temporary gear overrides.

Open **Cockpit** from the pause menu, **F4**, or
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
wheel, with a 75% default scale (normally 72–173 px). Settings → HUD → Minimap
size offers 50%, 75%, 100% and 125%, saved on this device. The map has a 72 px
minimum; the unscaled base is capped at 32% of viewport height for short
landscape screens. The final size is bounded by the viewport. It never pushes
pedals or other controls. The HUD plot is circular; its SVG world view and
road-click coordinates use equal horizontal and vertical spans. The separate Cockpit
GPS page retains a larger square map.
Mission title/objective and its optional waypoint live inside the map; tapping a
supplied objective routes GPS there. `navigationStore.setMission` is a session-only
adapter entry point, cleared by the mission owner on completion/exit. Today's
sandbox has no active match objective and shows SANDBOX / FREE DRIVE instead.
The optional server match clock overlays the map near the top of the circle;
when minimized it sits next to the small reopen icon.

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
Arrow keys select OFF/ACC/ON; Home switches off and Delete removes a key while
off. End holds START until its keyup. In the cockpit, controller A holds the
focused physical control until release; disconnect/cancel springs START to ON.
There is no latched one-second START pulse. Ordinary menu rows still activate
on their existing rising edge.


Climate has three round knobs: airflow/recirculation, fan/rear
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

The cap and both neighboring buttons use one polar layout in
`ui/Cockpit/stalks/geometry.ts`. Angles are measured counterclockwise from
3 o'clock. Lights/wipers use a 31%-of-wheel-width radius, ±11.5° spacing and 0.9 face scale.
Cruise uses a 27% radius, ±10.5° spacing and 0.75 scale.
Change the complete layout entry to move all three together. Direction targets
stay fixed during gestures; only the cap and rod follow the pulled detent. Labels are tangent
to the wheel; the right-side cruise direction placement is mirrored so RES/+ is
above SET/−. The full cockpit cruise diagram is mirrored in the same way.

| Stalk | Angle | Up / Down | Short cap tap |
| --- | --- | --- | --- |
| Left lights/signals | 120° | Right blinker / left blinker | OFF → AUTO → ON |
| Right wipers | 60° | Washer while held / single wipe | OFF → SLOW → MID → HIGH |
| Lower-right cruise | 326° | RES/+ / SET/−; holding repeats | Cruise ON/OFF |

Holding the lights cap for 220 ms requests the existing v6 high-beam flash.
Release restores the selected rotary mode without cycling it. There is no
separate FLASH target. Dragging also consumes a cap tap. Pointer/key release,
cancel, blur, pause, disconnect, hiding the levers and unmount all release flash.
A capability downgrade releases the original owner too.

Drag the cap around its arc, use its adjacent buttons, or focus and use arrow keys.
Direction targets and drags keep their pulled pose until release. Wipers and
cruise spring back to center; turn signals latch. Up advances Right through Off,
down advances Left through Off. Cockpit Lights uses vertical ▲ right / ▼ left
buttons and the same mutually exclusive turn-signal commands. Hazards remain a
separate command. Cruise and signal directions repeat every 350 ms while held. Signals step
through left/off/right in order, with the same result from two clicks. Washer stays requested
for the hold; programmatic clicks retain a short pulse.

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

The parking cable remains independent of gear selection and the momentary
keyboard/controller handbrake. HUD and cockpit now share a continuous control:
a quick click (up to 180 ms) releases the cable to zero for drifting. Holding
past that tap window increases current pressure over a 600 ms full pull (780 ms total);
release after a hold keeps it. The unlabelled metal tip also releases the latch. Arrow keys adjust 5%, Home releases and End applies full pressure;
dragging directly adjusts force. Interruption stops the active timer and retains
the last deliberate value. A pull runs a 20 Hz timer only while pressure grows.

The resting grip starts at −145°; full
pressure raises it to −90° with maximum reach. At full force its vertical height
is 119 px (85% of the aligned 140 px parent module), leaving whitespace above it. Its pivot sits at 75% of the panel width, and pressing anywhere in the parent area operates the lever. Level 3 is the largest optional crystal; the realistic default has no 0–3 labels. There
is no PULL label or contact glow/border flash. Angle and reach show pressure;
the simple P appearance uses a pressure arc. The normal slider/key focus locator
remains available without painting a held switch face.

Cockpit Drive saves REALISTIC LEVER / SIMPLE BUTTON, optional crystals, and
**Traction controls on driving HUD**. Three assist switches are the default; the
expanded bank is a saved option. These preferences never alter vehicle function
state. The silver faces and black text/icons retain temporary contact feedback.

Precise pressure requires cockpit v7: optional `parking_brake` in input and
snapshot carries the 0–1 latch independently of packed commands. The client
rounds to 0.1% and keeps legacy detents stable at one-third/two-thirds boundaries.
Rust applies this exact cable fraction through the existing rear-brake solver,
combining it with momentary handbrake force by maximum. Transmission P remains
independent. Other actions written before a send retain the fraction. Older
servers use the existing three detents until rebuilt with v7.

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

Setup advertises `hud.cockpit_version: 7`; v7 adds the optional precise cable
fraction in input/snapshot. v6 adds a held headlight flash, v5 enables airflow/fan4 and v4
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
| 20 | Held high-beam flash (v6); release restores the rotary light mode |

Flash is a level input, independent of rotary mode and explicit key commands.
Frontend source ownership releases it on pointer/key release, cancellation, blur,
pause, disconnect or unmount. Rust returns confirmed flash in `cabin_mask`,
headlights in `vehicle_mask` and high beam in `cluster_mask`. All four car models
raise their existing light targets; AE86 pop-ups open faster while flashing.

Switch face feedback uses `data-hud-held`, independent of `aria-pressed` system
status. Pointer clicks do not retain button focus, so Space remains a driving
brake. Keyboard focus uses an underline. The ignition ring sits outside the complete OFF/ACC/ON/START label radius. A
held sweep turns around that outer ring; its glow brightens during a hold and
flickers only with confirmed
`resource_mask.STARTING`; reduced motion makes it steady. `starterRelayAudio.ts`
plays quiet synthesized clicks during an acknowledged held start, and stops on
release, running, stale signal or teardown. No engine-cranking sample is loaded.

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
Chromium checks cover desktop and 390/320 × 844 mobile viewports, hit targets,
held/released commands, all seven themes and zero browser errors. These checks
do not measure gameplay FPS or establish physical-phone behavior. Rebuild and
restart Rust when applying the cumulative update. Current patch validation is
recorded in the package README.

Stalk center/direction highlights reflect physical holds only. Release, cancel,
blur and blocked input restore the idle style even while hover/focus remains.
The ignition outer glow, arc and label accents follow the same rule; the key
retains its actual position without a selected ring. Ignition is inset slightly
toward the vehicle between the center and right console. A brake tap clears on
pointer release directly, without depending on a follow-up synthetic click.
Holding at full strength keeps full tension and schedules no additional ramp.

## Compact circular controls

The HUD minimap is a circle with icon controls on its rim: expand/minimize,
destination ahead, clear, and zoom. It has no MAP label or dedicated header/footer
row. The mission readout, route status and server clock sit inside the circle.
Road coordinates use equal horizontal/vertical spans; transparent corners ignore
waypoint clicks. The full cockpit GPS page keeps its square map.

The shifter gate and brake parent are 140 px tall. The brake artwork reaches
85% of that height at full force, sits toward the right at 75% panel width, and
accepts contact throughout the parent area. Three switches sit left of the
pedals, retaining the same individual size as the expanded bank on phones.
Optional crystals grow from level 1 to level 3; the default has no numeric presets.

Engine-off-only dimming follows the confirmed engine flag on Dashboard's
`data-engine-on` attribute. Running brightness is unchanged. High contrast
retains full instrument gain. Dimming creates no additional telemetry timer.

## Momentary console feedback

Radio, climate and electronic-console buttons use one delegated contact-feedback
owner per surface. Pointer down prevents browser focus; pointer/key release,
cancellation, capture loss, pause, blur and disconnect remove the contact border.
Hover and confirmed toggle state do not select a button. Radio/climate
units may keep a border on the unit itself. Playback, hazards, A/C, recirculation
and defrost remain latched commands with truthful accessible on/off state; mute
also changes its center glyph. Main menu navigation keeps its existing behavior.
No feedback timer, network sender or per-pointer-move React render is added.

## Editing and state ownership

Start at `ui/Cockpit/README.md`. The `stalks`, `mechanical`, `ignition` and
`panels` folders each provide `index.ts` and a README listing files, functions
and editing recipes. `styles/index.css` composes the focused CSS files; legacy
CSS entry files import that barrel. Do not reintroduce physical HUD rules in
`cockpit.css`, where a later duplicate can silently override the shared styles.

`store/preferences/index.ts` owns local appearance/visibility preferences;
`store/menus` owns the selected cockpit tab. `store/input/index.ts` owns merged
intent and packed request helpers. `useCockpitState` reads confirmed telemetry;
Rust owns accepted vehicle state. Menu navigation lives in
`panels/useCockpitNavigation.ts`. Feature barrels expose reusable functions,
while the existing flat entry files keep older imports working.

Pedals and assist switches share `styles/switches.css` contact styling. Pedals
use the same delegated feedback owner as radio and assist controls; their border
clears on release/cancel even with the cursor still over the face. Hover, focus
and merged `aria-pressed` state cannot retain a depressed border. Assist faces
use silver gradients and black text/icons in every theme. Keyboard focus keeps
a thin underline so navigation remains visible without a press glow.

Cockpit → **Brightness** includes the live dashboard, a saved 10–100% brightness range and dashboard HUD visibility. Confirmed engine-off state multiplies the chosen gain by 0.42; high contrast bypasses that automatic dimming. Range arrows and controller left/right adjust 5%, with Home/End and a reset action. Both assist layouts keep identical individual switch dimensions, and each stalk rotates its cap and adjacent buttons together. Radio transport controls retain square bounds and circular borders; the ignition HUD sits slightly further right.
