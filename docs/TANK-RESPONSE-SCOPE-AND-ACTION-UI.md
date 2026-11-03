> Superseded tuning: current charge, cooldown and HUD behavior is documented in [Tank charge, controls and recovery](TANK-CHARGE-CONTROLS-AND-RECOVERY.md). Details below are historical.

> Controller reverse and rolling-turn behavior was refined in [Controller reverse and rolling tank turns](CONTROLLER-REVERSE-AND-ROLLING-TURNS.md): LT brakes then reverses in automatic Drive; hard steering now slows forward travel and curves the driving path.

# Tank response, angle lock, scope and shared action rings

This release supersedes forward-aligning Hull Lock and the preceding 16-second Ram cooldown. The update is cumulative; previous world editor, Hero loadout, portrait, menu and combat work is preserved.

## Driving and Ram

Tracked turning now combines differential contact forces with a bounded, ground-only arcade yaw assist. At rest its target is about 106 degrees/second, tapering with speed. It respects engine/gear/brake state, suspension, collisions and airborne inertia. Tests require a pivot over 75 degrees within 1.25 seconds, plus responsive moving/reverse turns without tipping. This is an arcade handling choice, not a detailed simulation of individual track links.

Ram now launches a grounded tank forward with up to +12 m/s of immediate speed, then maintains a 2.5× speed target and 4.5× drive-force multiplier for four seconds. Its 22-second cooldown begins at activation, leaving about 18 seconds after the normal effect ends. It cannot restart while cooling or auto-repeat from a held button. The timer continues when crossing a jump, with no airborne thrust; engine/drive failure, braking or parking cancels it. Release the controls before another activation.

A single valid contact per target supplies additional knockback to either team. Existing ordinary collision damage remains; the extra condition-damage bonus is enemy-only. Authored destruction rules and permanent land/land-bridge protection remain in place.

A short on-screen Ram tap now latches an input pulse long enough to cross the 60 Hz transport boundary. Rust publishes blockers such as ENGINE OFF, DRIVE GEAR, PARKED, BRAKES, AIRBORNE and REVERSING. A requested engine flag while cranking is not a running engine; the HUD waits for authoritative readiness. Keyboard/controller requests still have their own owners.

## Angle lock versus Reset Forward

Angle Lock captures the confirmed turret bearing AND elevation relative to the hull, including a sideways cannon, and retains both while the hull turns. Both aim axes stop changing until unlocked. Rust owns the captured angles and publishes them; client-supplied captured angles are ignored.

Reset Forward is a separate action. It releases angle lock and slews the gun back to forward with level hull-relative elevation. The server still bounds elevation to the original model range. R3 toggles angle lock; D-pad Up resets forward while armed. D-pad Down toggles scope while armed. Cars retain their prior D-pad hazards/radio actions.

## Cannon and scope

Cannon recoil impulse is three times the preceding value (36 kN·s), with deeper barrel recoil, a brief muzzle/impact flash and restrained camera kick. Reduced Motion suppresses camera kick. Cannon hits also transfer an impulse to dynamic vehicles.

Scope uses the confirmed gun direction and the displayed vehicle pose, with a separate 2×/4× perspective camera. The chase camera unmounts while scoped and returns on exit. Steering, pedals, firing and turret aiming remain available; large gauges/editor shortcuts/ignition are temporarily hidden to clear the research view. Menus, disconnects and leaving the tank exit scope. Default keyboard O is editable in Settings > Keyboard.

The research panel shows an ideal gravity-only arc to a y=0 datum, reference range, flight-time estimate, gravity drop and required low-angle elevation:

- x(t) = v₀ cos(θ)t
- y(t) = y₀ + v₀ sin(θ)t − ½gt²
- v₀ = 180 m/s; g = 9.81 m/s²; trajectory horizon = 8 seconds.

The server sweeps the cannon's gravity arc at 1/60-second segments and checks the breech-to-muzzle path first, preventing a barrel through a wall from bypassing it. Coax remains a straight 800 m trace. **Collision resolves at firing time: projectile travel delay is not simulated.** The scope's rendered arc is a datum estimate, not terrain-aware impact prediction or target tracking. There is no drag, wind or platform-velocity inheritance. These assumptions appear in the research view; finite flight-time projectiles remain future work.

## Reusable UI and Hero panel

ProgressOrbit owns the normalized clockwise fill/ready glow used by both ControllerAction's held-X glyph and weapon cooldowns. The six turret actions use coherent vector icons and separate circular faces outside the joystick radius. Cooling uses server timers, and ready actions show a full glow. Reset/scope/lock are state actions rather than invented timed cooldowns.

Hold X keeps its original 1.2-second confirmation and cancellation behavior, with the same glyph dimensions as A/B and a fixed 32 px Hero footer. The portrait selection diamond is removed. X MAIN has no rectangular backdrop. Styling uses compact theme surfaces and native vertical overflow; nonshrinking children, touch pan and contained scrolling let every option remain reachable on short/mobile screens.

## Checks and feedback

111 frontend tests pass, followed by the relevant final subset. All 154 Rust tests pass, including pivot timing, launch from rest, friendly/enemy knockback, sideways lock, wall obstruction, ballistic ground impact and airborne timer behavior. Direct TypeScript, changed-source ESLint and Vite checks pass. The real WebSocket regression and browser/mobile checks are recorded in validation.json. Browser fixtures use a diagnostic world; original GLB flash placement and controller/mobile feel need user visual feedback. Linux debug builds were checked; Windows release compilation was not run. Original Git LFS assets are still required for full npm asset prechecks.

Rebuild/restart BOTH frontend and Rust server. Old servers retain the old lock/Ram behavior and do not publish the new readiness/impact fields.
