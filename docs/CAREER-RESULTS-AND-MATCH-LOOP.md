# Career records, match presentation and combat controls

This patch connects a server-owned CTF round to persistent player careers. The UI follows the supplied team portrait, compact scoreboard, career table and end-match award references while using the selected AvenLab theme and shared controller buttons.

## Match flow

- Before deployment, Team shows only your five team slots with larger saved vehicle portraits and player/vehicle labels beside them. Stats remains accessible. Selecting a portrait inspects that player; hovering never selects them.
- In the world, hold Tab for the compact Red/Blue table, with your own statistics selected initially. Team and Stats are both available. While the board is open, LB selects Team and RB selects Stats. In composition, LT/RT (keyboard 1/3) switch View All / Red Team / Blue Team; B closes it without engaging the handbrake. Normal driving can continue beneath the passive board.
- CTF uses the first authored team spawn as each flag base; bases must be at least 12 metres apart. Strict matches start only after all ten players deploy a valid 5v5 composition. Flexible-composition development starts with opposed deployed teams and is visibly training, with no XP.
- Drive within 3 metres horizontally and 4 metres vertically of an enemy flag to take it. Carrying lowers maximum speed by 20% and increases actual incoming HP damage by 20%. Bring it to your base while your own flag is home to score. Touch your dropped flag to return it; dropped flags remain until physically touched. An owner-team touch returns the flag; an opponent can pick it up. Hazard drops use the last grounded carrier location.
- Defeat, departure, reset, a vehicle change or a teleport drops the flag. Captures and returns are evaluated from rigid-body positions in that world, never a client score claim.
- First to three captures wins. At 15 minutes the higher score wins; an equal score is broken by the last capture. No-capture ties are draws. The server freezes the final state and records it once.
- The end screen offers Awards, Team and Stats. Play Again leaves the ended room before using the existing queue/deploy flow. Leave returns to the selected game mode. Ended rooms release remaining occupants after 45 seconds.

## Career persistence

Authenticated profiles receive totals, session/match counts, wins/losses/draws, personal bests and award counts, indexed by mode, hero and the exact mode/hero combination. Damage, actual healing, self healing, fuel burned/refilled, kills, deaths, assists, resurrections, ordinary respawns, captures, returns, play time and best kill streak come from accepted server events. Ordinary respawns do not count as resurrections.

Career offers Overview, Statistics and paginated History. Values absent from an older profile remain unavailable until a recorded session supplies them. Overall activity includes training and practice; filters distinguish them. Practice records activity without invented wins, ranked results or XP. Training wins/losses are recorded in their own mode bucket and never grant progression. Scored CTF fixes the chosen hero when the round starts; warmup and practice remain editable. Practice activity is attributed to the last selected hero for the session, pending separate accounting for vehicle changes. Averages are formatted from authoritative totals and the displayed denominator; best streak is a maximum, never a sum.

A full immutable match archive lives in a sibling career directory beside the configured social-data file. Lightweight recent summaries are bounded to 50 entries in a profile; older records remain available through authenticated server pagination. Only a participant may fetch a full record. Duplicate finalization does not award statistics or XP again. The archive is written before the social result ledger commits; interrupted writes are recovered on server startup and are hidden from history until committed. Save failures remain errors and retry rather than reporting a successful result. Alpha storage has bounded result/index budgets; capacity errors preserve existing data and require server maintenance before additional records can commit.

MVP/SVP use a deterministic contribution score with objective, combat and ally-support credit. Self-healing does not inflate support awards. Zero-performance and abandoned participants do not receive awards. Play of the Game records a real server-observed combat/objective window and its statistics. **PENDING: captured video/replay playback.** The UI describes the recorded moment and does not pretend a replay has been filmed.

## Ability matrix and turret follow-ups

The matrix stays two columns by three rows. Scope/Ram are at the top, Roof MG/Coax MG selection in the middle, and Cannon/selected secondary firing at the bottom. The middle choices have different mount icons; only the selected small arm has a full highlighted selection ring. Choosing a mount does not fire it. The bottom-right fire action uses the original burst-shaped shooting icon and retains the selected weapon label. Controller Y and the configured weapon-cycle keys still cycle secondary guns; the cannon remains fixed.

Angle Lock fills while locking and drains while unlocking over a shared 250 ms input cooldown, then stays full or empty to show the real state. Reset retains its one-second button cooldown. If angle lock was on, Reset temporarily releases it, directs the gun forward and re-locks only after authoritative yaw/elevation reach that forward pose. A reset started in free aim remains free. Deliberate aiming or toggling lock cancels pending automatic re-lock; entering scope preserves the remembered lock preference.

## Acceptance still required

Physical controller and mobile playtests; full ten-player matches; long disconnect/rejoin and server-restart sessions; coastal spawn/objective fairness; sustained performance; final HP/weapon/logistics balance. Ranked MMR, hero-specific ultimates and cinematic replay capture remain pending. Source-level and automated checks are recorded in the package validation file; they do not replace those playtests.
