> Superseded tuning: current charge, cooldown and HUD behavior is documented in [Tank charge, controls and recovery](TANK-CHARGE-CONTROLS-AND-RECOVERY.md). Details below are historical.

> Current behavior: see [Tank response, angle lock and scope](TANK-RESPONSE-SCOPE-AND-ACTION-UI.md). Angle Lock now retains both captured axes, Reset Forward is separate, and Ram cooldown is 22 seconds. The details below describe the preceding release.

# Tank Ram and world HUD

This cumulative patch includes the console/instrument work in TANK-CONSOLE-AND-INSTRUMENTS.md and supersedes earlier orientation-mode wording. The player-facing lock is HULL LOCK: keep cannon yaw aligned with the hull, retaining elevation control. FREE AIM is independent world aim. R3 toggles them while armed; the server enforces alignment. Tank turret controls default ON when entering a tank. Manually stopping the test remains respected across overlays.

Edit Vehicle now belongs to the driving/world HUD in authenticated editor worlds. It opens the existing vehicle workspace directly; WORLD opens compact World Editor / Build In World actions. These tools no longer sit in a separate always-floating diagnostic bar. Existing editor-only server authorization remains in force, so live match physics cannot be modified through this entry.

## Handling baseline

The tank uses 200 kN engine force, 240 kN braking, 0.32 angular damping and stronger differential steering response. Its six forward gears, reverse, 108 km/h base target, 4,200 RPM max and 3,800 RPM redline remain. The radiator is scaled for the high-output fictional engine; fuel, heat, condition and shutdown still operate. Track forces remain bounded by real ground grip and contact, including during a charge. Brakes suppress drive effort.

## Ram controls and rules

| Control | Action |
|---|---|
| LB / left Shift / RAM HUD button | Start a charge |
| Left stick / steering | Steer during the charge |
| LT / brake / handbrake | Cancel the charge |
| R3 | Hull lock / free aim |
| RB | Fire selected weapon |
| Y / V | Cycle Cannon / Coax MG |

Ram is currently a tank ability. A press starts four seconds of automatic forward thrust; holding is not required. The speed target/ceiling increases by 150 percent, from 30 to 75 m/s (2.5x); traction effort rises to make it a fast physical burst. This is an increased drive target, not an instant teleport to 2.5x speed. Ground grip, starting speed, obstacles and steering determine the actual speed reached. Boosted momentum decays naturally after the thrust ends; there is no abrupt velocity reset. The tank speed dial expands to 300 km/h during Ram or while above its ordinary scale, then returns to its normal 120 km/h face.

Cooldown is 16 seconds from activation: four active seconds and twelve recovery seconds for a full uninterrupted charge. A cancelled charge keeps the remaining cooldown. Holding a button through the cooldown cannot repeat the attack. Engine off, explicit neutral/reverse, being airborne, braking, parking brake, stale input or disabled combat controls prevent activation/cancel the burst. Normal automatic Drive can launch from rest. Ability clocks are server-owned and replicate to observers; clients cannot extend the duration or clear cooldown with claimed timer fields. Reset/model changes cancel the active burst without refilling its cooldown.

## Contact damage

Ram retains ordinary collision effects on both vehicles. A qualifying frontal enemy collision adds 3–25 percent vehicle-condition damage, scaled by relative closing speed, once per target per charge. Additional ability damage does not apply to friendly vehicles, and only actual enemy damage earns ultimate credit. The hit must have a real Rapier contact impulse and at least 3.5 m/s closing speed; touching or parked contacts are insufficient. Rear/side contacts outside the frontal cone receive no Ram bonus.

A qualifying hit on an enabled, standalone authored destructible structure applies 150 base structural damage using its cannon susceptibility. Indestructible assets and permanent coastal land/land bridges are protected. A target hit list prevents repeated damage from multiple colliders or contact substeps. Existing unsupported GLB/repeated-chunk destruction remains unsupported.

Weapon projectile damage to vehicles, shell flight, explosion blast, finished Ram effects/audio and dedicated coax geometry/effects remain pending. Ram is intentionally a single simple cooldown ability, with no paid gameplay upgrades.

## Other included HUD changes

- Shifter above AIM/FIRE in the former shift-knob console area; independent shared visibility switches.
- Native six-gear knob pattern and server-calibrated speed/RPM faces.
- Turret/elevation/readiness inside compact/full Climate HUD, respecting its existing visibility switch.
- Clock hands/rings on FIRE, Cannon, Coax MG and RAM.
- Left-center chat; collapsed launcher anchored at the component bottom.

## Needs feedback

Please test turning speed, baseline acceleration, Ram duration/cooldown, brake cancellation, mobile reach and impact balance. Use Factory Physics -> Apply if an older saved tank tuning masks the baseline. There are four bogie proxies, not simulated track links. Windows release compilation and real hardware controls still need user verification; automated build/tests run on Linux. The full npm asset precheck needs the original Git LFS assets.
