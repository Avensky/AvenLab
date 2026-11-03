# Tracked tank and cockpit controls

Steering calibration and the secondary-weapon status below are superseded by [TANK-HANDLING-AND-WEAPONS.md](TANK-HANDLING-AND-WEAPONS.md). Cannon / Coax MG selection is now implemented.

## Tank model and collision

Uses the supplied, original `frontend/public/models/vehicles/tank.glb`.
SHA-256: bb4a5d63a134adfe0eb6d426bd8fa91e3c5a4a4656268b50120f28854d813452.
This matches the repository's Git LFS object; no re-export or asset rename is
required. Keep the real GLB present when building/testing, not its LFS pointer.

The export contains sibling meshes with baked coordinates, plus a duplicate
whole tank named Tank_Body_Non_Modular. getTankParts hides the duplicate and
adds yaw, elevation and recoil pivot groups while preserving rest transforms.
The original Turret, Cannon and Breech meshes are used. Roadwheel axle groups
preserve the combined wheel meshes and roll with actual forward/reverse travel.
This is not simulated tread-link or animated belt geometry.

Hull bounds, track spacing, contact radius and bogie positions were measured
from the supplied GLB. Rapier uses a hull box, a rotating solid turret box and
a rotating barrel query sensor. The barrel is hittable in ray queries but does
not physically snag walls or lever the hull over. These are simple collision
proxies, not exact triangle collision for every visible component. The actual
art and collision share chassis-relative pivot positions; turret yaw/pitch are
independent of hull heading and account for chassis tilt.

## Tracked movement

Tank has an explicit tracked drive model, separate from car tire traction.
Four raycast bogie proxies reuse suspension and anti-roll support. Left/right
belt target velocities produce grip-limited impulses at contacts, including
pivot turns without forward throttle, forward/reverse travel and braking.
There is no direct artificial yaw torque and airborne belts cannot steer.
Stationary turning loads the engine separately from the travel command.
Neutral/parking/engine-off states do not create free propulsion. Reverse is
limited to 8 m/s; factory forward speed is 18 m/s. Tank steering angle and
Ackermann fields are hidden and remain zero in validated physics presets.
This is a tuned game approximation; terrain handling and balance still need
user feedback. Apply Factory Physics if an old local tune masks the new feel.

## Cannon and controls

Vehicle Editor -> Weapons -> Test Turret Controls enables aiming and returns
to the world. Stop Turret Test disables it. Cockpit -> Turret also has an on/off
switch and aim joystick. No Combat Test diagnostic card covers the instruments.
The compact instrument row shows confirmed hull-relative bearing/elevation,
reload time and READY/SAFE state.

Controller: drive with RT/LT and left-stick steering; right stick aims; RB
fires while controls are enabled (instead of honking). Mobile: keep steering
and pedals, use the second AIM joystick next to steering and hold its FIRE
button. Aim and fire own separate pointers. In the open cockpit, the joystick
can aim while stationary but firing is disabled until the cockpit closes.
Mouse over the world aims; mouse/touch can hold FIRE. Turning controls off,
blur, overlays and stale network input prevent held-fire leakage.

The server selects the tank's factory cannon/mount; clients cannot equip an
assault profile to bypass its reload. Yaw traverses at 1.5 rad/s, elevation at
0.8 rad/s, with -10° depression / +20° elevation relative to the hull. One shell
reloads automatically in 3 seconds. Each accepted shot increments a replicated
counter, animates barrel recoil and applies a 12,000 N·s opposing impulse at the
mount exactly once. Cannon direct hits use 300 base structural damage times
the authored cannon multiplier. Permanent coastal land bridges remain protected.
There is no shell travel/drop, blast damage or vehicle combat damage in this
slice. Other roles retain their existing structure-test weapons. Tank secondary
weapons, an ultimate, explosion effects, sounds and balance remain future work.

Use Inspector -> combat -> Add Practice Wall, Apply & Test Drive, enable turret
controls and aim/fire to test structural damage. Reapplying the editor world
resets damage. Instructions live in Cockpit -> Missions, not a floating note.

## Cockpit and editor layout

COLUMN contains Lights / Wipers / Cruise subtabs. DASHBOARD replaces the old
Brightness label. CONSOLE contains Radio / Climate subtabs. Existing route IDs
are retained so old HUD shortcuts still open the correct child page. LB/RB
moves between parent systems. TURRET is a separate cockpit system.

Vehicle Editor uses compact two-column fields and content-height panels.
Weapons, Camera and Materials omit unrelated physics action footers. Long
fields scroll inside the panel so the header/actions stay reachable on mobile.

## Validation

Rust compilation, physics regressions and actual two-client local WebSocket
checks are recorded in validation.json. Browser checks use the real uploaded
GLB and the real cockpit/editor components. Desktop and mobile QA screenshots
are internal only. Full match balance, moving-tank aiming latency and prolonged
mobile play still need feedback on the user's devices.
