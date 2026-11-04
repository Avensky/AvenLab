# AvenLab alpha milestones

**Alpha target:** one complete Quickplay CTF match on a curated coastal map, playable with keyboard, controller and mobile controls. Tank handling/HUD tuning is the baseline; further armor modules and vehicle classes follow the core match loop.

This patch implements the vehicle-health foundation with automated integration and abuse checks. Physical multiplayer playtests and reconnect/latency acceptance must pass before the combat milestone is considered complete. Initial tuning and policies are in `ALPHA-COMBAT-HEALTH.md`. Checkboxes below describe release gates, not merely the presence of code or a menu button.


Current follow-up: health-bar visibility, separate tab profiles, primary/secondary tank controls, authoritative session statistics, and the hero ability guide are documented in `PLAYER-STATS-AND-COMBAT-CONTROLS.md`. The subsequent career/results patch implements the server-owned CTF loop and persistent records; see `CAREER-RESULTS-AND-MATCH-LOOP.md`. The recovery follow-up adds the live Mechanic recovery ability, a 12-second downed window, nearest safe home/central-road respawn and touch returns and a ten-second dropped-flag timeout; see `RECOVERY-AND-FLAG-CONTROLS.md`. MMR, other hero abilities, a usable ultimate and replay video remain pending.

## Next closed-alpha playtests

1. Run a full six-player CTF match with keyboard, controller and touch. Check all six action positions, 2×/4× scope entry and exit, and adjusting a locked turret while the driver turns. Record which vehicles benefit from a scope.
2. Playtest the objective and recovery loop. Include a handoff, a defender returning their own flag, a timed return, a teammate shove, a moving wreck, a Mechanic recovery and an occupied respawn.
3. Record six- and ten-player runs on the target phone. Compare frame time, FPS, network timing and dropped inputs with the scoreboard closed, open and while scoping. Include vehicles firing simultaneously.
4. Pick the first preview ability to implement from those sessions. Give it server validation, resource cost, cooldown, counterplay and a clear HUD state. Verify base routes, repair points and spawn safety on one candidate coastal map.
5. Rehearse reconnect and match completion, verify progression after server restart, then tag a clean, installable build with a version identifier, capture instructions and known issues for invited testers.

## 1. Authoritative vehicle combat — current patch

Foundation: server-owned vehicle HP, damage attribution, defeat/respawn state and client health feedback. Integrate these with the existing cannon, machine gun, Ram, service bays and session lifecycle.

- [x] Cannon, machine-gun and Ram hits change the correct vehicle's HP; define and test friendly-fire behavior.
- [x] Defeated vehicles cannot drive, fire, activate Ram, repair themselves or bypass defeat through Reset/Change Vehicle.
- [x] Safe team-spawn recovery restores the vehicle after the server countdown; an occupied spawn retries safely.
- [x] Spawn protection expires predictably and cannot be refreshed through vehicle swapping or manual reset.
- [ ] Damage, defeat, respawn and protection replicate to other players and survive the permitted reconnect path.
- [ ] Two clients repeatedly defeat and respawn each other without duplicate kill credit or leaked physics bodies.

**Exit:** complete the two-player combat loop using actual input packets and authoritative snapshots. Automated coverage is required; physical multiplayer playtesting remains a separate gate.

## 2. Complete CTF match loop

The server now produces verified results from gameplay. Automated rules and persistence coverage are implemented; complete physical multiplayer acceptance remains open.

- [x] Implement flag pickup, carrier penalties, drop, return and capture.
- [x] Drop/return flags after death, disconnect, reset, vehicle changes and teleport recovery, with automated coverage.
- [x] Server score and match clock produce one frozen result, followed by results/queue/leave actions.
- [x] Persist that result once with career records and eligible rewards; reject client-authored scores, wins and XP.
- [ ] Accept a full ten-player start-to-rematch session on physical devices.

**Exit:** start, finish and replay a match without restarting the application or manually awarding results.

## 3. Minimum useful team roster

Depends on milestone 1; balance together with milestone 2.

- [ ] Validate the tank, at least one DPS vehicle and one mechanic/support with real ally repair/refuel value.
- [ ] Tune HP, weapon cadence, Ram/stun, movement and logistics costs through complete fights.
- [ ] Enforce support slots only when those roles have useful playable abilities. Use the existing flexible-composition testing option for development; those sessions cannot award progression.
- [ ] Verify damage, healing/refueling and disable states cannot target another world or impersonate another player.

**Exit:** each required role contributes during a real team fight. Extra heroes and unique ultimates are not required for this first roster.

## 4. One match-ready coastal map

Can proceed alongside combat work; final validation depends on CTF rules.

- [ ] Lock fair team spawns, two objective routes, an optional risky shortcut and accessible service bays.
- [ ] Drive-test bridge approaches, jump landings, chokepoints, collision edges and predictable water/fall recovery.
- [ ] Validate flag placement, spawn safety and barriers under tank blocking/Ram tactics.
- [ ] Save/export/install preserves the map ID and appears consistently in editor and environment selection.

**Exit:** both teams can complete the objective using safe and risky routes, with no required route blocked by a bad collider or unusable spawn.

## 5. Multiplayer reliability

Foundation already includes admission/queueing, isolated runtimes, reserved seats and practice/editor retention. Verify these with the completed gameplay loop.

- [ ] Run full 2–10-player sessions through queue, hero selection, spawn, combat, match end and rematch.
- [ ] Confirm equipped cosmetics, turret motion, shots, impacts, health and destruction agree between clients.
- [ ] Exercise latency, tab-away, disconnect/rejoin, reservation expiry and occupied-world recovery.
- [ ] Confirm practice/editor bodies remain retained as intended and one world's actions never affect another.

**Exit:** complete a multiplayer soak session with reproducible logs and no body loss, duplicate admissions or mismatched match outcomes.

## 6. Device and performance acceptance

Depends on a playable match and representative map.

- [ ] Finish a match with keyboard, controller and a physical mobile device.
- [ ] Verify reverse, aiming, firing, weapon cycling, cooldowns, menus and accessibility without blocked inputs.
- [ ] Agree target-device frame/tick/loading budgets and record results with ten vehicles and sustained combat.
- [ ] Use capture/export logs to reproduce frame stalls, input loss and connection failures.

**Exit:** documented device results meet the agreed budgets and no control/UI issue prevents finishing a match.

## 7. Closed-alpha release

Depends on all preceding gates.

- [ ] Create a named Git commit/tag and prove installation from a clean checkout with the intended assets.
- [ ] Show a build/version identifier and provide error/performance capture plus a known-issues list.
- [ ] Verify profile/cosmetic persistence, ownership and legitimate match-result rewards after restart.
- [ ] Run a small closed playtest, fix match blockers, then expand access.

**Exit:** testers can install, play, report a versioned problem and return for another session without developer intervention.

## Work after the alpha loop

Independent roof-gun durability/disabling; richer armor modules; more heroes/ults and cosmetic bundles; ranked/MMR and paid shop; aircraft/drones/boats/fleets; World Director/world conquest; cinematic automation. Reuse the validated combat, repair and networking lifecycle as these systems are added.

## Recommended patch order

**Vehicle combat and respawn → complete CTF → minimum support gameplay → curated map/team balance → multiplayer/device soak → closed-alpha release.** Map authoring and documentation can proceed alongside the first three patches.
