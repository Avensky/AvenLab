# Cornering support and wheel orientation

The excessive lean had three separate causes in the current implementation:

1. The final suspension pass clipped every tire to `1.5 * Fz_reference`, even
   after anti-roll redistribution. That discarded axle support as the outside
   tires loaded up. In the headless turn it bottomed the chassis into the road.
2. Vehicle mass came from the collision box. For the BRZ/FR-S that placed the
   nominal center of mass 0.895 m above the road. The visual height registration
   fixed the GLB placement, but did not change this physics lever arm.
3. Wheel snapshot rotations copied chassis roll and pitch. This ray-wheel
   simulation has no suspension camber linkage, so the tires inherited a body
   tilt that their ground contacts did not model.

## Changes

- Keep the existing spring/damper impact guard of `2.2 * Fz_reference` before
  anti-roll. Remove the second, lower clip after redistribution. The bar still
  conserves axle load and prevents negative normal forces.
- Define body mass, COM and finite cuboid inertia explicitly. The collision box
  has zero density so it does not add a second mass. Recompute properties at
  spawn before the first custom suspension solve.
- Keep collision geometry, nominal suspension geometry and GLB registration
  separate from handling mass properties. Rapier supports this separation:
  https://rapier.rs/docs/user_guides/rust/rigid_body_mass_properties/
- For grounded wheel snapshots, use the contact-plane forward/side/up basis.
  For airborne snapshots, retain chassis orientation and steering. The frontend
  continues to add visual spin once.
- Record absolute body roll in degrees and airborne tire count from ordinary
  snapshots when profiling is enabled. Show mean/p95 in the lag overlay, current
  roll/contact count in the debug menu, and include both metrics in CSV/JSON.
  There is no added debug stream or extra network field.

## Handling parameters

Edit `center_of_mass_height` in `avenlab-server/src/vehicle_setup.rs`, in meters
above a level road at nominal sag. BRZ inherits the GT86 value.

| Configuration | Previous nominal COM height | New target |
| --- | ---: | ---: |
| AE86 | 0.855 m | 0.50 m |
| GT86 | 0.885 m | 0.46 m |
| BRZ / FR-S | 0.895 m | 0.46 m |
| Camaro | 0.905 m | 0.53 m |
| Supra | 0.840 m | 0.46 m |
| Tank | 1.300 m | 1.30 m |

These are game handling targets, not measured manufacturer specifications.
The legacy `chassis_com_offset` field now controls collision-box placement;
mass height has its own parameter. The COM can lie outside this simplified
collision envelope. Its location is not inferred from the GLB roof or bounds.

On a level road a rough lateral load-transfer estimate is:

`outside load per tire / resting load ~= 1 + 2 * lateral_acceleration * COM_height / (gravity * track_width)`

For the former BRZ mass height, 0.8 g and roughly 1.73 m track width gives about
1.83 times resting load on each outside tire. A 1.5 cap cannot provide that
support. Simply increasing anti-roll stiffness would still encounter the cap.

## Verification

`cargo test --locked --manifest-path avenlab-server/Cargo.toml`

29 Rust tests pass, including mass/COM initialization without changing the box
or nominal body height, tilted-body wheel snapshots, airborne wheel orientation,
support conservation, half-meter drop recovery, and left/right driving tests.

The turn regression settles on a level test road for two seconds, starts at
20 m/s, then holds steering input +/-0.2 for five seconds without throttle.
Both runs below use the corrected support pass; only mass height changes.
This isolates the COM contribution rather than mixing changes in one number.

| Vehicle | Peak roll with former COM | Peak roll with new COM | New contact-loss frames |
| --- | ---: | ---: | ---: |
| AE86 | about 3.58 deg | about 1.92 deg | 0 |
| GT86 | about 2.89 deg | about 1.57 deg | 0 |
| BRZ / FR-S | about 2.30 deg | about 1.23 deg | 0 |
| Camaro | about 2.64 deg | about 1.60 deg | 0 |
| Supra | about 2.45 deg | about 1.39 deg | 0 |

The initial reproduction with the old support clip still present reached about
19 degrees for the BRZ and 21 degrees for the AE86. Removing that clip accounted
for most of the excessive lean; lowering COM provides the remaining reduction.
These results describe this headless maneuver, not every driving condition.

25 frontend tests, TypeScript, ESLint and the production build pass. Frontend
tests cover heading-independent roll, unknown/contact states and metric export.
In-game visual fit and driving feel still need a road test after installation.

## Road test

1. Rebuild and restart the Rust server and frontend; create a fresh vehicle.
2. Enable the lag/data overlay in the debugger. Drive repeated left and right
   turns at similar speeds, using the same camera and route for comparisons.
3. Check body-roll p95 and airborne-tire count. Enable wheel, suspension-ray
   and load-bar diagnostics when a contact needs closer inspection.
4. Capture/export a baseline before changing COM or anti-roll parameters.

The current contact solver uses vertical rays and a flat-up contact normal.
Grounded wheel orientation follows that same model. Banked/sloped roads would
need actual hit normals and consistent suspension/contact geometry; this patch
does not introduce a camber-linkage or banked-road model. The small FR-S axle
placement adjustment can be handled separately from roll and contact support.
