# Health visibility, tab players, combat controls and hero guide

This update extends the alpha combat foundation. Install both frontend and Rust sources: the new gun, session statistics and remote levels require the rebuilt server.

## Six-slot cockpit playtest

Every playable vehicle deploys with its own turret and six action buttons. Scope opens a 2× or 4× view on all ten chassis. The Vanguard also shows its ballistic trajectory and research readout. Aiming with the touch stick or controller right stick while Angle Lock is selected changes the stored hull-relative bearing and elevation. The server applies the turret’s turn rate and pitch limits. Releasing the stick holds the new angle as the chassis turns.

The Sierra’s test bank reads Scope, Anchor, Tow Line, Winch, Brace and Fire. Buttons marked **TEST** respond to a press with a brief **TESTED** label. They send no gameplay request. The Fortuner’s primary remains the assisted health pack, and the CX-30 retains its pressure spray.

## Controls

| Action | Keyboard | Xbox controller / touch |
| --- | --- | --- |
| Cycle health bars | J by default; rebind in Settings → Keyboard | Settings → HUD → Health bars |
| Player statistics | Hold Tab; release to close | Cockpit → Missions → Match Stats; B closes |
| Hero abilities | Choose the Abilities tab in Customize | Customize → Abilities or Match Stats → Hero Abilities |
| Cannon primary | Hold F by default | Hold RB; bottom-left fire button |
| Selected secondary | Hold I by default | Hold D-pad Right; bottom-right fire button |
| Cycle secondary | V / G by default | Y; Swap Secondary button |
| Ram | Shift / Ram button | LB |
| Angle lock / free aim | Joystick lock button | R3; full ring = locked, empty = free aim |
| Reset turret | Reset button | D-pad Up; one-second cooldown |
| Scope | O by default | D-pad Down |

Saved keyboard choices take precedence. New bindings select a free key when an older custom binding already occupies a default. LT/RT continue to brake/reverse and accelerate. Opening statistics alone preserves driving; opening the hero guide releases driving/fire inputs and keeps the world mounted.

## Health bar policy

One persisted setting controls both your HP and remote markers: Show all, Show red team, Show blue team, Hide all, or Hide self. Red/blue use confirmed team colors, including your own vehicle when it matches. Hide self shows both teams' remote bars. Hiding bars keeps incoming-damage feedback and the defeat/safe-respawn notice. Shortcuts do not run while typing, in menus or the terminal, or on stale/disconnected telemetry.

## Quickplay in two browser tabs

Continue waits for a confirmed player profile. The later career/results patch supplies live CTF scoring and records; ranked MMR remains pending.

1. Open the first tab normally with your main player.
2. Open another tab. If the saved player is already online, choose **NEW TAB PROFILE**.
3. Continue into Quickplay with that separate player. Its styles/progress belong to it; your main credential and unlocks are preserved.
4. Reload/reconnect in the same tab to restore that tab player. A duplicated tab can inherit browser session storage; if that copied player is online, use New Tab Profile again. Rename a tab player through Social → Profile.

The server still rejects two simultaneous connections using one profile. No identity or ownership checks were removed.

## Tank guns and firing origins

The cannon always remains the primary. Secondary cycling changes only small arms:

| Gun | Range | Damage / interval |
| --- | --- | --- |
| Roof MG | 800 m | 8 HP / 0.1 s |
| Forward coax MG | 200 m | 8 HP / 0.1 s |

The forward gun uses the supplied model's `Interior_TurretBasket` and the small external barrel beside the cannon in `Turret`. Only its gun geometry receives elevation; the basket's other interior parts remain attached to the turret. The flash is placed 0.035 m beyond the measured visible muzzle. Geometry is separated at runtime and disposed with the vehicle; the GLB does not need replacing or renaming.

All three server reload timers advance while holstered. The primary and secondary have independent device holds and brief tap pulses. If both are held, a ready cannon has priority; the selected MG can fire during cannon reload. The server validates cadence, hit queries, damage and firing origins. Weapon changes, death, menus, blur and disconnect clear the relevant held inputs. Angle-lock shows state after a brief 250 ms fill/drain animation. Reset restores prior lock after the forward pose is confirmed.

## Session statistics

Hold Tab for red/blue player cards, including yourself and each player's equipped portrait. Cards show final blows, deaths, K/D, assists, actual damage, healing including its self subset, liters burned/gained, completed respawns and confirmed profile level. Statistics belong to the current world session and survive ordinary respawn and permitted retained-body reconnects; they are not lifetime career totals.

Damage excludes overkill, protected and friendly hits. An assist requires accepted enemy damage within eight seconds of the defeat; the final-blow player does not also receive that assist. Self-service counts actual HP restored, with no overhealing. Fuel records engine/ability consumption and service-bay refills; spawn, chassis capacity changes and debug factory refill do not inflate totals. Stats and player/profile/level mappings come from the server. Stale views retain their last confirmed totals with a notice.

**Pending:** ranked MMR calculation. Mechanic combat revivals now count as resurrections; automatic respawns have their own count. Ally mechanic/refuel abilities remain an alpha milestone. The later career/results patch implements CTF scoring and persistence.

## Hero ability guide

Choose a vehicle in Heroes and open the Abilities tab in Customize to see its portrait, weapons, three ability slots, ultimate, buffs and debuffs. Hero Abilities in Match Stats opens the reference for the deployed vehicle. Tank descriptions cover Ram's charge and tail, resource costs, scope research and turret tools. The guide reuses live effect descriptions and secondary-loadout metadata.

Planned abilities are labeled in the reference. Return to Performance to pick up the current build preview.

## Feedback requested

Test the forward muzzle through yaw/elevation and compare the two MG ranges in a real fight. Verify physical controller bindings, mobile readability and scoreboard return behavior. HP, weapon balance, assist timing, fuel costs, long reconnect sessions and ten-player performance remain playtest gates.
