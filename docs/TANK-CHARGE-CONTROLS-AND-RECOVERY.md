# Tank charge, controls and recovery

This is the current tank behavior. Earlier release notes describe historical tuning.

## Ram

A grounded tank launches forward by up to 12 m/s, then charges for 3 seconds with a 2× speed target and 3× drive force. It then has 4 seconds at a 1.25× speed target and 1.35× drive force. Only the charge automatically applies throttle. Steering remains available in both phases. The cooldown starts at activation and lasts 60 seconds. Braking, parking, reversing, engine failure or being stunned cancels the effect without refund. Crossing a ramp preserves the timer without airborne thrust.

The charge physically knocks both teams back. Each contacted enemy receives the bonus collision damage and a one-second stun once per activation; friendly contacts receive no ability damage bonus or stun. The reduced boost cannot apply the bonus or stun. Stun suppresses drive/steer/fire requests temporarily, preserving impact momentum. All timers and effects are server owned; client-supplied timing fields are ignored.

Ram spends 10 liters immediately and charges 4 percentage points of condition plus 6°C heat when it ends or is canceled. Temporary heat accumulation is reduced during its seven-second maximum duration. Boosted drive force does not multiply the engine's thermal demand. A hot/damaged/low-fuel engine cannot start another charge. Deferred heat never cools an already hotter engine and is capped below critical shutdown. Normal service/repair bays can restore the cost. Balance numbers need play testing; repeated use is intended to reward mechanic support.

## Controls and HUD

Settings > Keyboard and Settings > Controller expose shared yaw and elevation sensitivity (0.25×–3×), persisted on the device. Both the pointer aim stick and controller right stick use them. Angle lock renders the captured local axes against the same interpolated hull used to render the tank; the scope uses that same pose, avoiding network-vs-render transform jitter. Reset Forward stays separate.

Tank aim and optional gear gate use the same responsive size as other vehicles. Settings > HUD can hide the shifter independently, including on mobile. The e-brake is left of aim. Ignition is left of the assists bank and dims while the engine is on, returning to full opacity on interaction. Seven actions including Ram live together beside/below aim. Keyboard/controller fallback weapon selection remains available when touch aiming is hidden.

Hold-X and all ability cooldown faces use the shared opposing fill/halo component and full ready glow. Icons stay centered. Labels show CHARGE / BOOST and remaining phase time. Stun status appears in the dashboard turret readout. The Hero footer stays its previous fixed height.

Quickplay teammates use their server-confirmed appearance. A teammate who has not selected a role can show their main hero's appearance with CHOOSING status; this preview does not reserve that role. Empty seats remain empty.

## Returning to the game

An unexpected disconnect remembers an already deployed vehicle and world. After the existing authentication flow restores the same profile, recovery rejoins the authoritative world if needed and sends one new spawn request when its map arrives. Old socket callbacks cannot reset the new world. Repeat disconnects can retry. Navigating away cancels recovery; explicit disconnect does too. A rejected join/spawn returns to selection with an explanation rather than leaving a mapless driving screen. No password is cached or bypassed. Returning to a stale open socket closes it to use the same recovery path.

This restores deployment at the server spawn, not the last disconnected position. Real background-tab/browser GPU behavior still needs feedback on the user's device.

## Pending / feedback

- Tune charge force, stun, 60-second cooldown and repair cost against other roles.
- Test physical controller sensitivity and real mobile reach with original models.
- E-brake drift with counter-steering remains deferred; current e-brake behavior is preserved.
- Cannon/coax switching stays unchanged. Separate machine-gun mounts and aim systems are a future design decision, not shipped here.
