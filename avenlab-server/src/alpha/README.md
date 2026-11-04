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

Matching fills a compatible waiting lobby before creating another game. Running
and ended rounds accept reserved reconnects only; an ordinary late arrival opens
another lobby or queues. FIFO blocking and queue positions are scoped to the
requested mode + size, so a full 3v3 does not block a waiting 5v5. Multiple match
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
Round start resets the resource. The ultimate action itself remains pending.
