# Alpha vehicle combat and respawn

This document records the initial combat-life foundation. The cumulative follow-up now implements CTF scoring and persistent results (`CAREER-RESULTS-AND-MATCH-LOOP.md`) plus downed recovery, mechanic revival and physical flag returns (`RECOVERY-AND-FLAG-CONTROLS.md`). Ranked MMR and physical multiplayer acceptance remain pending; release gates are tracked in `ALPHA-MILESTONES.md`.

## Initial tuning, pending player feedback

| Setting | Initial value |
| --- | --- |
| Tank combat HP | 1,200 |
| Other vehicles | 500 |
| Cannon direct hit | 250 HP |
| Roof machine-gun hit | 8 HP |
| Ram bonus enemy hit | 150 HP, plus normal impact damage |
| Respawn countdown | 5 seconds |
| Spawn protection | 2 seconds; firing or starting Ram ends it |
| Repair/combined bay | 10% maximum HP per second |

These are starting values for playtesting, not final balance. The cannon uses the existing authoritative ballistic query, while the machine gun uses its existing hit query. There is no new radial vehicle explosion damage or armor penetration simulation. Weapon effects continue to replicate through existing shot/impact snapshots. Live nontracked weapons use a server factory roof-center mount; editor mount coordinates remain authoring previews until validated loadouts exist. Swapping away from a tank removes its turret/barrel colliders.

## Server rules

Combat HP and mechanical condition are separate. Heat, fuel, nitrous and engine wear retain their previous mechanics; weapon hits reduce HP. Accepted crash severity also reduces HP, even when mechanical condition is already exhausted. Friendly weapon/Ram HP damage is disabled for alpha, while physical collisions and world-impact penalties still resolve. Actual enemy HP damage earns ultimate credit; a lethal hit earns one kill and one death.

Defeat clears driving and attack intent, cancels Ram and disables body/colliders so the corpse does not block movement or shots. Entity/body identity stays stable. The server advances the countdown without waiting for player inputs. It retries the recorded map spawn when occupied; HP stays zero until safe placement succeeds. A successful respawn restores HP and mechanical resources, preserves session K/D and remaining Ram cooldown, and grants brief protection. Cached dead inputs are discarded, so an old held packet cannot launch another attack after respawn.

Reset and vehicle swapping preserve HP damage and do not refresh protection. Defeated players cannot reset, swap, fire, Ram or self-service. Browser/transport clients never provide HP, damage or kill totals. The existing debug mechanical service command does not restore combat HP. Repair bays restore HP; fuel-only bays do not. Destroyed service bays stop servicing both teams.

Practice/editor reconnect uses the retained body and migrates its health under the new connection ID. Match disconnection continues the existing seat/body cleanup policy; keeping a destroyed vehicle through an expired match reservation is not claimed. An intentional editor-world replacement starts a fresh world.

## Feedback and controls

The passive health readout shows server HP, K/D, protection, damage flash and defeat countdown. It distinguishes an occupied spawn from a running countdown and hides stale telemetry. Defeat blocks driving/aiming and clears held attacks/scope until an alive snapshot returns. Protection also appears in the shared circular buff row. Remote vehicles have compact health markers, with staggered 100-millisecond scene line-of-sight checks and a 120-meter display limit; a ten-vehicle performance soak remains an alpha gate.

## Player acceptance still required

Play complete fights with two real clients, then controller and physical mobile devices. Verify incoming damage readability, repair-bay usefulness, spawn safety and starting HP/damage values. Test reconnect/latency during defeat and respawn. CTF scoring, career records and Mechanic recovery now have automated coverage. Physical team playtests, additional support abilities and final balance remain pending; follow the ordered checklist before adding further vehicle classes.
