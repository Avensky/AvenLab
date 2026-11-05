# Snapshot transport v1

The authoritative simulation remains at 60 Hz. Updated clients explicitly
negotiate `snapshot_format: 1` after the welcome advertises
`compact_snapshot_version: 1`; snapshot publication then runs at 30 Hz.
Version 0 and clients that never negotiate retain the legacy JSON stream.
Unknown requested versions leave the current format unchanged.

This is lossless, masked JSON, not a new quantized binary physics protocol.
Client-to-server inputs already use the AI-v1 binary format. World positions,
wheel transforms, HP, cooldowns and acknowledgement sequences preserve their
existing numeric values. Static field names become positional tuples; the
frontend restores the existing store shape at the network boundary.

## Full frames and deltas

`snapshot_compact` contains `version`, `world_id`, a positive `base_id`, and
`data`. The seven root fields are tick, simulation time, tick duration,
entities, match state, asset health and server timing. Tuple order is defined
in `snapshot_wire.rs` and mirrored in `compactSnapshot.ts`. The Rust-generated
fixture verifies every restored field against the legacy representation.

`snapshot_delta` contains the same version/world/base identifiers and a patch:

| Patch | Meaning |
| --- | --- |
| `null` | Keep the baseline value |
| `[0, value]` | Replace this value |
| `[1, low, high, ...patches]` | Array change mask; two unsigned 32-bit words, ascending field order |
| `[2, {field: patch, ...}]` | Existing object fields that differ from baseline |

Array patches support up to 64 elements; larger arrays or structural changes
use replacement. Dense changes use replacement too. An entire update becomes
a new full frame if the delta would be larger than the compact full frame.

Every delta refers to an immutable full frame, **not the preceding delta**.
This permits the existing latest-frame mailbox to discard intermediate frames
without breaking reconstruction. A value that returns to its baseline is
omitted and therefore correctly restored, not retained from the previous
displayed frame. Values that remain different from the baseline still appear
in subsequent deltas until a new baseline is established; this bounded
repetition deliberately avoids per-client acknowledgement histories.

Full baselines rotate after 60 simulation ticks (normally one second), when
entity membership/order changes, or when replacement is cheaper. Each socket
receives a required baseline before its next delta, even if its mailbox skipped
the original full publication. IDs are process-unique; decoder state is reset
for a new socket/world. Invalid/missing baselines trigger one resync request by
repeating `snapshot_format: 1`. Renegotiation also works after the round ends.
Older baseline frames needed for decoding cannot rewind the client's displayed
tick or input acknowledgements.

## Flags and input deduplication

The entity flags word packs defeated, combat enabled, fire, hull lock, ram and
static impact (bits 0–5). A separate wheel word packs grounded state by wheel
index. Existing vehicle, player, cockpit, cabin, resource and cluster masks
remain intact. Changing tuple meaning requires a new negotiated version.

The input sender compares the actual negotiated AI-v1 bytes, excluding sequence
and transport dt. Changes send at the next normal input sample. Identical
inputs refresh every 100 ms, below the server's 250 ms combat freshness limit.
The final neutral teardown packet bypasses suppression. A new socket resets
the comparison. Legacy input transport keeps its original cadence.

## Boundaries and costs

Encoding and baseline storage are shared per world/visibility group, never
per receiving player. Private warmup filters enemy identities before encoding
and uses separate public/red/blue baselines. Debug data remains opt-in. Frozen
completed rounds stop repeated snapshots except membership or transport
revision changes. Reliable control messages retain their bounded queue;
physics remains latest-only, and stalled sends retain a five-second deadline.

The codec scans borrowed JSON slices per published world/group, avoiding a
second conversion/formatting pass over physics numbers, and performs one
reconstruction per client update. Measure this CPU cost along with traffic.
At 30 Hz, snapshot spacing is about 33.3 ms instead of 16.7 ms; physics and
changed-input sampling remain 60 Hz. This reduces bandwidth and frontend update
work but is not a claim of reduced physical internet latency.

## Ownership and nominal cadence

| Data / consumer | Cadence | Scope |
| --- | --- | --- |
| World simulation | 60 ticks/s | Server only; not a packet |
| Vehicle poses, wheels, visible combat and match state | 30 snapshots/s compact, 60/s legacy | One encoding per world/visibility group; stops when a finished round stays unchanged |
| Driving/weapon intent | Changed input sampled at up to 60/s; unchanged packed input refreshes after 100 ms | Driver to server only; no input clock without a living local body or while hidden; hiding sends one neutral release |
| Driver gauges and input acknowledgement | At most one ordinary update per six simulation ticks, and only when changed | Driver only. A cockpit, cabin, handbrake or cruise change can send at the next publication |
| Debug overlays and per-wheel tire readings | Up to 10/s | Requested channels only, own vehicle by default; explicit all-player scope. No debug output in private warmup |
| Maps, setup, social changes, results and chat | Event-driven | Initial state or relevant change. Spawning no longer resends the map that world admission already delivered |
| Socket liveness | App RTT ping every 5 s when available; server WebSocket ping every 8 s | Connection only. A quiet completed round stays connected while its transport responds |
| Local consumers | HUD 20 Hz; minimap 10 Hz; open statistics 4 Hz; cabin clock at 30 s intervals | Local subscriptions/timers, not extra network polls |

Compact shared entities use null slots for last input sequence, cockpit mask, cabin mask, parking brake, cruise target, fuel, engine temperature and engine torque. A separate `driver` packet contains world ID and those eight values in that order. Send it before the first shared frame for the driver (and again on reset). The decoder projects the last sample onto that driver's entity only. Remote entities expose none of those fields. The compact stream preserves numeric precision; individual lanes intentionally have different sample times. Version 0 retains the original all-entity schema. Diagnostics subscribers never implicitly inherit other clients' selections. World/identity reset clears private data. Live driver updates and individual debug views are the small per-recipient exceptions to shared serialization.
