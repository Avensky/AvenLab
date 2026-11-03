# Tank steering response and weapon selection

The console layout, tank performance/gauge calibration and lock controls are updated in [TANK-CONSOLE-AND-INSTRUMENTS.md](TANK-CONSOLE-AND-INSTRUMENTS.md).

This update supersedes the original tracked-tank steering calibration and single-weapon controls in TANK-AND-COCKPIT.md. It preserves the original native turret/cannon rig, mobile aim controls, editor test toggle and grouped cockpit.

## Steering

The server still uses four suspension contact proxies. It now separates common belt force (travel) from differential belt force (turning), reserves available effort for steering, and caps lateral scrub before applying the combined grip limit. Previously, excessive lateral demand scaled away longitudinal track forces and both belts could saturate identically under throttle. Tank steering now also retains powered steering authority through road-style gear changes. Engine state, fuel/condition power loss, manual neutral, brakes and ground grip still constrain it.

Full steering requests opposite belt travel at 4.8 m/s for a pivot. Travel speed reduces by up to 45 percent during a full turn. Tank-only angular damping changes from 1.20 to 0.45. No direct body rotation or airborne yaw impulse is added; bumps, recoil, suspension and collisions still act on the same physical hull.

Local same-range measurements after one second of full steering:

| Condition | Before | After |
|---|---:|---:|
| Stationary pivot | 0.095 rad/s | 0.713 rad/s |
| Accelerating turn | approximately 0 rad/s | 0.702 rad/s |
| Reverse turn | 0.045 rad/s | 0.664 rad/s |

Regression tests cover both steering directions for pivot/forward/reverse, minimum turn response, useful travel speed, bounded yaw rate, upright hull, low pivot drift, brakes, engine-off and airborne behavior. Values describe a flat local test, not an all-terrain benchmark.

## Weapon controls and HUD

The bottom-center selector is shown only while the tracked tank is armed, in the driving scene with no overlay. Touch/click selects either slot. Controller Y cycles on a rising edge; keyboard V cycles once per key press. When disarmed, Y remains headlights and V remains Live CAN. Non-tank vehicles retain their controls. Menu, typing and focus gates remain authoritative for input routing.

The selector uses global app theme variables, at least 44-pixel touch targets, pressed-state semantics and confirmed server readiness. Portrait reserves a bottom control row; small landscape lifts aim/fire above that row. No floating combat diagnostics are restored.

Switching clears touch/mouse/controller fire intent. Controller requires RB release before another held burst. The input packet carries a bounded weapon identifier and the server chooses the actual weapon profile. Unsupported identifiers fall back to cannon; non-tanks remain on their primary. Client ammo, shot counts and cooldown claims are ignored by the server.

| Slot | Damage type | Base damage | Cadence | Recoil |
|---|---|---:|---|---|
| Cannon | Cannon structural multiplier | 300 | One shell / 3 seconds | Physical hull impulse + native barrel animation |
| Coax MG | Small-arms structural multiplier | 20 | 0.1-second interval | No cannon kick |

Both cooldowns advance while holstered, including during a stale-input stop. Switching cannot refill a cannon shell. The selected weapon, general shot counter, separate cannon shot counter, ammo/readiness and remaining cooldown replicate in snapshots. Separate cannon counters prevent MG bursts or weapon changes from replaying barrel recoil on observers.

## Scope / needs playtesting

Coax currently fires hitscan along the existing native turret aim origin; dedicated MG geometry, traces, muzzle flash and audio are pending. Damage is limited to explicit non-repeating authored structures with destruction enabled. Vehicle combat damage, blast, shell flight, ammo reserves, drone weapons and special abilities are not implemented here. Land and designated permanent land bridges stay protected.

Real controller/touch ergonomics, turn balance on varied terrain and Windows release compilation need user verification. Source checks run on Linux; the full npm asset precheck needs the original road/garage GLBs, which are Git LFS placeholders in this workspace.
