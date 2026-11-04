# Alpha policy and progression

mod.rs defines volatile membership, FIFO tickets, reconnect reservations and
managed mode types. policy.rs maps eight heroes to approved chassis and roles;
it keeps room for valid five-player compositions and exact one-of-each-role three-player teams. progression.rs owns persisted
win tiers, 1–100 levels/prestige, milestone credits and voucher ownership.

Server's operations mutex serializes these mutations. server/alpha_sessions.rs
owns admission, hero changes, reservation restoration and live editor application.
Only trusted future match-rule code can call record_completed_match; no WebSocket
reward-grant action exists. The result ledger prevents duplicate awards. Flexible
composition tests, practice and editor worlds cannot grant progression.

New fields have serde defaults for existing social files. Back up runtime/social.json
privately before upgrades. This remains a single-process alpha store; commercial
accounts, database-backed result rosters, payment and skin rendering are separate
future work. See docs/ALPHA_UI_AND_LOBBIES.md.

Hero loadouts: hero_loadout_save validates the policy hero, hex/factory body color, finish and seat request, and checks skin ownership. It persists the default hero and vehicle-keyed loadout in progression. Spawn, hero/model changes and editor rebuilds attach the matching appearance to entity snapshots. Body paint is editable alpha customization; no rare-item grant or purchase API is introduced.

Quickplay and Competitive now accept an independent `team_size` of 3 or 5
(default 5). Three-player teams require exactly one Tank, DPS and Support;
five-player teams retain the established role policy. The old `skirmish` ID is
accepted as a separate compatibility-only 3v3 pool, without a new UI mode.

Matching prefers an available seat in a compatible running round, then a waiting
lobby. A disconnected match player has a 30-second reservation by default.
Explicit Leave releases the seat immediately. Replacements choose an available
role on the vacant side. Ended rounds stay closed to new profiles. Queue order
applies among eligible tickets for the requested mode and size. Multiple match
rooms share the configured server budget: defaults are three active worlds and
24 players; editor and practice still allow one occupied world per category.
Active/queue/roster/world/CTF/result views carry authoritative `team_size`.
New career records preserve the format; old records infer their historical mode
size. Strict rounds start only after every required hero has a spawned body.
Flexible composition remains training with no progression. See
`docs/MATCH-FORMATS-AND-CONCURRENT-GAMES.md` for controls, limits and migration.

Ultimate charge is a server resource: connected, living, enabled bodies gain
1/480 per simulated second, while actual enemy damage and Mechanic teammate
HP restoration add normalized target-health fractions. Passive charge does not
use browser/wall-clock or packet dt, grants no XP, and stops for detached/downed
bodies and ended rounds. Refueling, service and self-healing never award charge.
Round start resets the resource. At full charge, any deployed vehicle can activate Barrage for five seconds. The room server selects exposed enemies within 45 m and resolves the cannon, machine guns and shield hits.

Playtest warmup publishes deployed vehicles and their configurations to both teams. Set `AVENLAB_HIDE_WARMUP_ENEMIES=1` before starting the server to restore team-private warmup frames. Undeployed hero picks remain private. All vehicles have one shield. Vanguard uses its directional barrier, BRZ uses Guard Boost, and the other vehicles use the two-second personal shield on an 18-second cooldown.
