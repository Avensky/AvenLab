# Combat and destruction

## Live aiming and first structure test

Vehicle Editor -> Weapons now saves a local per-chassis weapon/mount preset.
Enable controls in Vehicle Editor -> Weapons -> Test Turret Controls. Mouse motion over the canvas, controller
right stick, or the right touchpad changes world turret yaw/pitch; left-stick /
existing touch steering remains independent. Right trigger still accelerates;
RB fires instead of honking in combat mode. Mouse/touch can hold the HUD Fire
button. Enabling starts aim at the chassis heading. Overlay/hidden-page input
is disabled, pointer release/cancel and focus loss stop firing. Right stick
no longer doubles as throttle while combat is enabled.

Pose travels in the existing input/snapshot stream. Rust clamps mount offsets,
yaw and pitch and accepts only known role names. Shared placeholder turrets are
world-oriented, with mount offsets attached to the chassis. Non-tank vehicles use placeholders; the tank now articulates its original GLB parts. Mount presets stay local per vehicle,
and the equipped mount is replicated while the player is connected.

For the first destructive test: place a spawn, Inspector -> combat -> Add
Practice Wall. Apply & Test Drive. The wall is 25 m forward from the first spawn
with 100 HP and a test small-arms multiplier of 1. Aim at it and hold Fire.
Rust uses nearest-hit Rapier ray queries, excludes the shooter's body, owns
cadence and damage, stops stale firing after 250 ms of unchanged packet sequence,
and disables all hit-body colliders when HP reaches zero. Health/destruction is
included in snapshots for all players, including late joiners. Authored visuals
hide only after confirmed zero HP. No physics reset occurs when a wall breaks.
Permanent land and land bridges ignore hits. Session rebuild resets damage.

Scope: only explicit standalone non-repeating authored box/wedge structures
currently take damage. GLB/model/road prefab damage, repeated chunks, vehicle
hits, cannon/bomb blasts, medic healing, buffs, ammo/reloads, rotation-speed
limits, camera-to-crosshair convergence, automatic acceleration, rubble and full
building/bridge collapse still need implementation. Non-tank roles use 20-base-damage structure test shots; medic fires more slowly but does not heal. The tank uses its factory cannon profile.
The HUD labels unlimited test ammo and pending abilities. Damage does not earn
progression rewards. This is an opt-in combat test, not balanced matchmaking.

Rust source includes practice-wall and tracked tank regression tests. Compilation, backend tests and local two-client WebSocket tests now pass; see the latest validation.json.

Next: server-owned ammo/reload and rotation limits; camera convergence and mobile ergonomics; vehicle damage and medic ally healing; then cannon/bomb falloff, protected-route checks and bounded rubble.

## Tank update

The tank now uses its factory GLB turret/cannon, tracked movement, server-owned traverse/elevation limits, a one-shell reload and physical/barrel recoil. Combat Test floating UI was removed. Use Vehicle Editor -> Weapons Test/Stop, or Cockpit -> Turret. See TANK-AND-COCKPIT.md for current behavior and remaining scope. Rust has now been compiled and tested, superseding the earlier toolchain limitation. Other roles remain prototypes.
