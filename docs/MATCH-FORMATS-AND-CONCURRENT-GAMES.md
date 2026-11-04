# Match formats and concurrent games

Play now treats **Quickplay / Competitive** as the mode and **3v3 / 5v5** as its independent match size. The portrait cards label only size. A 3v3 card does not switch the selected Quickplay or Competitive tab.

## Server contract

Modern clients send `mode_join` with `mode: "quickplay" | "competitive"` and `team_size: 3 | 5`. Missing team size preserves the existing five-player default. Unsupported sizes or non-numeric values are rejected before the player's existing seat is released. The legacy `skirmish` ID remains a separate compatibility pool for earlier 3v3 clients; it is no longer a separate Play tab. New clients use Quickplay or Competitive with an explicit size.

Admission results, active seats, queue tickets, roster cards, public managed-world rows, CTF snapshots and match records carry authoritative team size. The frontend restores this size from the server rather than guessing from the selected tab or a stale local preference.

| Format | Seats | Team role policy |
| --- | --- | --- |
| Quickplay 3v3 | 6 | One Tank, one DPS and one Support per team |
| Competitive 3v3 | 6 | One Tank, one DPS and one Support per team |
| Quickplay 5v5 | 10 | Existing five-player limits: Tank max 1, DPS max 3, Support max 2; required minimums preserved |
| Competitive 5v5 | 10 | Same five-player composition policy |

Competitive continues to be an alpha mode. Ranked MMR is still pending; choosing Competitive does not enable an unfinished rating system.

With `AVENLAB_ROLE_LIMITS=0`, a full deployed roster can start a training round with flexible roles. Training results do not grant competitive progression.

## Bounded simultaneous games

Matchmaking fills open seats in running games first, then occupied waiting rooms of the same mode, map and team size. When all compatible seats are occupied or reserved, the server can open another world within its limits. Explicit departure releases the seat immediately. A connection loss reserves it for the authenticated player for 30 seconds by default. A replacement chooses from the roles available on the short-handed team and joins the existing round with their own statistics. Ended games accept no replacements.

When the budget is full, players retain their requested mode and size in the queue. A blocked queue for one format does not prevent an available waiting room of another format from filling. Freeing a world lets a queued format create its next game. Reconnect restores the original reservation rather than matchmaking the returning player into a different game.

`AVENLAB_MAX_ACTIVE_WORLDS` and `AVENLAB_MAX_PLAYERS` remain the server budget controls. Defaults are three active worlds and 24 active players. Environment values are clamped to at most 16 worlds and 160 players. This change allows multiple games within that budget; it does not launch unlimited server processes or remove resource limits. Sandbox and World Editor retain their dedicated alpha slot policy.

## Verification and player acceptance

`scripts/test-match-formats.mjs` uses an isolated disposable server and real authenticated WebSocket profiles. It checks all four mode/size combinations, same-format filling, malformed size rejection, budget queuing, a second simultaneous game, role enforcement, scored six-vehicle CTF start, live replacements, reconnect expiry and token reconnect. It uses only normal production admission and deployment messages, with no test-only teleport, damage, result or HP endpoints.

The default world budget may permit fewer than four formats to be active at once; queued selections are expected when that budget is occupied. Increase limits only after measuring the intended host with multiple active matches. Physical controller/mobile menu comfort and full-map concurrent physics/rendering performance still require playtesting.
