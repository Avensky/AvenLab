> Superseded tuning: current charge, cooldown and HUD behavior is documented in [Tank charge, controls and recovery](TANK-CHARGE-CONTROLS-AND-RECOVERY.md). Details below are historical.

> Current behavior: see [Tank response, angle lock and scope](TANK-RESPONSE-SCOPE-AND-ACTION-UI.md). Angle Lock now retains both captured axes, Reset Forward is separate, and Ram cooldown is 22 seconds. The details below describe the preceding release.

# Tank console, instruments and combat feedback

Cumulative follow-up to TANK-HANDLING-AND-WEAPONS.md. Existing cannon recoil is retained. No GLB changes are needed.

## Layout and visibility

The tank's touch aiming controls move from the steering wheel to the right-side transmission console. A compact mechanical shifter sits above AIM, FIRE and the hull-lock button. Edit Vehicle and compact world tools are part of the live world HUD in editor sessions. Parking remains alongside it, and pedals/assists retain their lower row. The normal non-tank shifter remains in the same transmission area.

Settings -> HUD and Cockpit -> Turret expose the same persisted SHIFTER and TURRET AIM / FIRE visibility preferences. Hiding the turret HUD does not disable controller aiming; Vehicle Editor -> Weapons -> Stop Turret Test still disables the weapon test. Aim/fire follow the global touch-controls setting. If drive equipment is hidden, enabled touch turret controls can still be shown independently.

Turret bearing, elevation and confirmed weapon readiness move out of the gauge cluster into the climate unit, in both compact/full layouts. Use the existing Climate HUD switch to reveal that unit if it was hidden in a saved layout. The standalone cockpit Turret page retains its instrument preview.

Driving chat moves to left-center. Its region keeps a stable bottom edge, so minimizing leaves the small launcher at the bottom rather than jumping to the top. Expanded messages open upward within that region. Chat's existing channels, authenticated transport, auto-minimize and controller shortcuts are retained. The shared chat visibility preference is now honored in the driving HUD.

## Orientation lock

HULL LOCK keeps the turret yaw aligned with the vehicle's forward direction while elevation remains adjustable. FREE AIM permits independent world aim. Tap the lock button or press R3 while armed. Rust enforces the local yaw lock even while the hull turns; the existing input sender also aligns the command. FREE AIM is the default. R3 retains normal downshift/Dyno behavior while turret controls are off.

Tank turret controls now enable automatically on entering a tank. Explicit Stop Turret Test stays respected across overlay changes, and changing into another tank enables controls again. The lifecycle owner remains mounted while HUD/overlays are hidden; aiming/fire routing still respects those screens.

## Cooldown clocks

The FIRE button and both tank weapon slots share a clock-ring component: a rotating hand and filling rim show cooldown progress; the full ring means ready. Cannon and coax cooldowns are separately replicated from Rust even while holstered, so changing selection never falsely resets the cannon clock. The selected weapon's clock also appears on the cockpit fire control; firing remains disabled while that cockpit overlay is open. Other prototype vehicle primary weapons use their confirmed reload cadence on their fire control.

Clock state is presentation only. Holding fire still lets the server repeat at the accepted cadence; a cooling clock does not reset pointer ownership or bypass reload. Missing cooldown readings show an unavailable clock. Finished muzzle effects, sound, vehicle combat damage and blast remain pending.

## Fictional tank performance and calibration

The tank has six forward ratios and one reverse. Its new gameplay target is 30 m/s (108 km/h), using a 200 kN base engine force. Engine calibration is 4,200 RPM maximum and 3,800 RPM redline. Tank radiator capacity is scaled for the higher-output engine; temperature/condition/fuel penalties and overheat shutdown remain active. Braking suppresses track drive effort, preventing the stronger engine from overpowering a held brake during a pivot.

Rust advertises the forward-gear count with the existing vehicle calibration. Shifter gates and knob patterns draw only those forward gears, plus N/R (or P/R/N/D in the automatic layout). Six is the current protocol maximum; there are no extra fake gears. Controller/manual forward stepping respects the advertised count.

Speed and RPM faces now use server calibration instead of a fixed car speed scale and a 9,000-RPM floor. The tank's readable dial ranges are 120 km/h and 4,500 RPM; the needle and redline use the corresponding tank data. Other vehicle faces also follow their own calibration. Local health/performance tests verify the real contact solver reaches sixth gear and exceeds 90 km/h on a large flat range with the engine still running.

## Needs user playtesting

Check mobile reach, chat readability, full/compact climate visibility, hull-lock versus free-aim feel and the faster tank's balance on real maps. Existing saved tank physics can override factory force/speed settings: select Factory Physics and Apply to test the new baseline. Four bogie proxies still approximate tracks; final balance, individual tread animation and Windows release validation remain pending.

See TANK-RAM-AND-HUD.md for the four-second charge, extra collision damage, cooldown and updated handling.
