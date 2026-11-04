# 3v3, team HUD and ultimate charge

This describes the earlier standalone `skirmish` patch. Current Play separates
Quickplay/Competitive from 3v3/5v5 size and supports bounded concurrent games;
see `MATCH-FORMATS-AND-CONCURRENT-GAMES.md`. Legacy `skirmish` remains compatible.

## Play selection and match rules

Play now has portrait cards on the right for Quickplay, Competitive and 3V3 CTF. Clicking a card or confirming it selects that mode; hovering does not select or join. Xbox-style navigation, Back and Continue remain available. The other modes retain their existing controls.

3V3 CTF uses the `skirmish` mode ID: six seats, three per team, the existing 15-minute/first-to-three flag rules, and a strict composition of one Tank, one DPS and one Support per team. All six must deploy before a scored round starts. Explicit flexible-composition testing remains training without XP. Existing 5v5 composition rules are preserved.

The alpha keeps its single shared match-world budget. A 3v3 request cannot join a running 5v5 room; it queues while an incompatible match occupies that slot. Full seats and reconnect reservations also queue new arrivals. Team previews, composition, queues, results, Play Again and career mode filters understand three-player teams. Career records and rewards remain server-owned; 3v3 is a casual mode, not ranked MMR.

## HUD presentation and performance

The standalone HULL HP overlay is retired. Recovery countdowns, defeat/fuel alerts, damage feedback and other players' health markers remain. Teammate portraits sit below the classic gauges and remain available when those gauges are hidden.

Live teammate rows use a small roster/health projection rather than rebuilding full scoreboard statistics. Live play reuses cached custom portraits; it does not start a new 3D portrait renderer for an uncached teammate skin. A lightweight static portrait with style indicators is used until an exact cached portrait is available. Layout observers track real component targets without reconnecting for every changing descendant; unchanged measurements do not rewrite layout styles.

Delayed numeric telemetry remains marked unavailable after its normal freshness limit. Gauge illumination may retain the last confirmed power state for a short two-second window in the same player/world/vehicle context. This is visual continuity, not fabricated telemetry or a physics change. Genuine disconnects, identity changes and expired continuity clear it. It prevents short packet delays from replaying an ignition-off/start appearance.

These changes address identified HUD work and display flicker. Full GLB rendering, server contact cost and network behavior with clustered vehicles still require a multiplayer performance capture on the user's actual map and machine.

## Climate and team colors

Climate time, temperature and performance text are larger. A wider light clock capsule has extra padding to the right of the time, while the surrounding readings sit closer together. Single Bar stays one row. Compact can place performance on a dense second row below 200px; wider compact layouts prioritize FPS and ping.

Confirmed Red or Blue match membership accents the top match bar, steering-wheel stitching and player-statistics chrome. Background/text contrast still follows the selected app theme. Saved theme and cosmetic choices are not rewritten; leaving the match restores their normal appearance. Opposing-team rows keep their correct relationship colors.

## Flag cloth and ultimate meter

The flag pole still follows the same interpolated vehicle pose. Its cloth is now a small curved, two-sided sheet with a fixed pole edge and a gently waving free edge. It swivels smoothly around the pole when the camera would otherwise see only its thin edge. This is a cosmetic effect; pickup, drops, detection and scoring remain authoritative.

Connected, living vehicles gain passive ultimate charge from fixed server simulation time. Initial tuning fills an empty meter in about eight active minutes without other contributions. Actual accepted enemy damage and actual teammate HP restored contribute faster. No charge is granted from a browser-reported value, overhealing, refueling, service/self repair, defeated bodies or offline retained vehicles. Charge caps at 100%; official round starts reset warmup resources. Passive charge grants no XP. Usable hero ultimate actions are still labelled PLANNED.

## Pending acceptance

Test 3v3 with six real players, reconnects, a complete match and rematch. Check physical mobile/controller navigation, the larger climate row and preferred HUD combinations. Capture clustered-vehicle performance with the installed GLBs to distinguish any remaining GPU, physics and network costs. Tune passive charge, healing/damage contribution and the flag's swivel/wave based on playtesting. Ranked MMR, remaining hero abilities/ultimates and cinematic replay capture remain outside this patch.
