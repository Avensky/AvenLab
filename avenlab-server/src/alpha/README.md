# Alpha policy and progression

mod.rs defines volatile membership, FIFO tickets, reconnect reservations and
managed mode types. policy.rs maps seven heroes to approved chassis and roles;
it keeps room for valid five-player compositions. progression.rs owns persisted
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
