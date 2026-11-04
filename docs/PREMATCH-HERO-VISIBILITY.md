# Pre-match hero visibility

The server publishes each player's allied picks and styles during selection. Opposing picks remain mystery cards until the actual CTF round starts. This applies to modern Quickplay/Competitive sizes and the legacy Skirmish pool; practice/editor behavior is unchanged.

`alpha.active.match_id` and `match_phase` describe that player's exact runtime round. A waiting or missing round does not authorize a reveal. The scheduler publishes a fresh social view immediately after the actual start gate, so the preview does not require a manual Refresh or the viewer to deploy first.

Hidden roster entries contain `hero_hidden: true`, empty `hero`/`showcase_hero` and `appearance: null`. Public names, team and seats remain available. Allied entries keep their selections. Reconnect reservations follow the same visibility policy, and another world's running phase cannot reveal a waiting world's picks.

Warm-up snapshots omit opposing vehicle entities, including their model, collider, paint, weapons and telemetry. At most two team-specific serialized frames are shared per waiting world; frame production is not repeated per client. Physics diagnostics are withheld during this phase. Vehicle configuration broadcasts, existing-config replay on join/reconnect and deployed hero changes use the same viewer/team filter. Starting the round reveals every vehicle configuration and returns to the normal shared snapshots.

The server's full roster, hero-role enforcement and physical bodies remain authoritative and unchanged internally. This conceals direct current-selection packets rather than promising complete anti-cheat secrecy: before start, players could still infer information from warm-up physical contact or health changes if they reach an opponent. Warm-up damage and collision rules are not redesigned in this UI patch.

Focused Rust tests cover viewer-specific roster/redacted styles, reserved players, exact-world reveal, shared team frames and setup replay. `scripts/test-prematch-privacy.mjs` uses six authenticated production clients, real picks/spawns, a warm-up hero swap, reconnect and the actual scored start gate. It uses no test-only damage, phase, teleport or HP endpoints.
