# Network and physics scheduling audit — 2026-11-05

This patch follows the 5v5 connection audit. It reduces snapshot traffic and
repeated input, isolates worlds' CPU work and removes small recurring force
allocations. It retains the existing rigid-body solver, colliders and 60 Hz simulation. The new optional tire heat/pressure multiplier defaults off.

## Delivered changes

- A negotiated lossless tuple format removes repeated property names. Masks
  pack combat/health booleans and wheel contact flags. Nested change masks omit
  baseline values that have not changed, including appearance, collider shape,
  health and controls. All cars moving no longer replaces the whole entity list.
- Shared baselines rotate every 60 simulation ticks or when membership changes.
  Each socket receives the required baseline before a delta; dropped/coalesced
  updates never depend on the preceding delta. Private warmup filters before
  separate team caches. Missing baselines request one resync. Ended rounds stop
  repeated snapshots but still honor membership and decoder recovery changes.
- Updated clients receive snapshots at 30 Hz. Changed inputs still sample at
  60 Hz; identical binary inputs refresh at 100 ms. Release changes send on the
  next sample, and final teardown neutral input bypasses suppression. The server
  continues its existing 250 ms combat freshness safety behavior.
- Baseline comparisons use borrowed JSON slices, preserving literal numeric
  values and avoiding a second float parse/format pass. Encoding/cache work is
  shared per world and visibility group, not repeated per player. The browser
  normalizes once at ingestion and rejects stale ticks before acknowledgements.
- The global scheduler no longer awaits each world serially. One bounded CPU job
  per world allows other rooms and socket tasks to run through a slow tick.
  Pending jobs do not accumulate catch-up work. Busy world locks are retried on
  the next scheduler pulse. Shared CPU saturation can still affect all rooms.
- Four-wheel/bogie compression and loads use fixed arrays rather than tiny
  HashMaps. Temporary contact/impulse buffers are reused across vehicles in a
  force pass. An unused contact-ID string clone is removed. Force equations and
  integration cadence do not change.

- Compact shared frames omit eight driver-only fields. Ordinary driver telemetry and input acknowledgements send at up to 10 Hz when changed; cockpit/cabin/parking-brake/cruise edges can bypass that interval. The browser keeps these fields off remote entities. Debug overlays send only requested channels, with per-car or explicit all-car scope, up to 10 Hz. Maps send once on admission, and repeated spawn requests reuse existing configuration.
- The frontend suspends input timers without a living local vehicle and after a hidden-tab control release. A responsive transport survives a paused or finished physics stream; missing-body snapshots and disconnected transports retain separate recovery paths. The HUD and minimap keep their existing local sampling owners.
- Tire heat and pressure are an optional saved-world rule. Tracked vehicles bypass it, disabled worlds use existing grip and enabled worlds reuse suspension contacts without extra raycasts. Temperature and PSI go only in requested wheel diagnostics. See TIRE-HEAT-PRESSURE.md.

## Validation

325 Rust tests passed; one manual benchmark remains ignored. Twenty-two targeted
frontend tests passed, as did production frontend and Rust release builds.
Cross-language fixtures verify full/delta numerical parity and optional fields.
Tests cover all boolean flags, both mask words, malformed masks, immutable
baselines, returning to baseline, missed updates, resync and frozen final rounds.

Live checks cover mixed old/new clients, explicit fallback, unknown versions,
five discarded deltas, a deliberately lost baseline, private warmup, 100 ms held
input, control release, four matchmaking formats, handshake limits, reconnect
grace, queued replacements and two simultaneous full 5v5 worlds. The 5v5 soak
uses both JSON and binary inputs and has no browser renderer or WAN emulation.

## Traffic and frame gaps

These are separate localhost runs with two real ten-player CTF worlds using the release server. All twenty peers drive, steer and fire; there is no browser renderer. Rates are application payload bytes for snapshots plus driver packets, not TCP/TLS framing, map downloads or total bandwidth. Each figure below is per receiving player. The live driver uses both JSON and packed inputs, with changing aim, so this is not a claim about WAN latency or whole-session upstream savings.

| Build / mode | World | MB/s | Bytes per received snapshot¹ | Received snapshots/s | p95 gap (ms) | Worst gap (ms) |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| Previous build, legacy | quickplay | 1.707 | 28,872 | 59.1 | 20.9 | 902 |
| Previous build, legacy | competitive | 1.707 | 28,857 | 59.1 | 19.8 | 802 |
| Patched, tires off | quickplay | 0.210 | 7,090 | 29.7 | 45.5 | 139 |
| Patched, tires off | competitive | 0.201 | 6,732 | 29.8 | 45.9 | 122 |
| Patched, tires on | quickplay | 0.195 | 7,043 | 27.7 | 51.2 | 690 |
| Patched, tires on | competitive | 0.200 | 7,100 | 28.2 | 47.2 | 698 |
| Patched, legacy transport | quickplay | 1.723 | 28,820 | 59.8 | 20.9 | 160 |
| Patched, legacy transport | competitive | 1.688 | 28,866 | 58.5 | 23.0 | 132 |

¹ Driver-only bytes, when applicable, are included in this average. The previous build and patched tires-off runs were each two minutes; the tires-on and patched legacy controls were each one minute. These are separate simulations; variation between them is not a controlled estimate of tire-model cost.

At its nominal 30 Hz, the new tires-off payload would cost about **0.20–0.21 MB/s per player**, compared with about 1.73 MB/s at 60 Hz for the previous build. Actual Hz matters: missed publications also reduce measured traffic, and missing frames are not a performance win. The first masked-codec prototype reached a 12.75 s arrival gap; the table gives observations for the delivered build.

The isolated capacity benchmark steps 10,000 combat ticks per run with no sockets or renderer. Two-world measurements here step both worlds in serial to expose total CPU cost; the live scheduler runs independent room jobs. These are runs, not a stable maximum capacity.

| Build | Worlds × 10 | p95 work (ms) | p99 work (ms) | Max work (ms) | Ticks over 16.7 ms |
| --- | ---: | ---: | ---: | ---: | ---: |
| legacy-base | 1 | 0.96 | 1.55 | 6.8 | 0 |
| scoped | 1 | 3.11 | 5.27 | 36.9 | 2 |
| legacy-base | 2 | 2.48 | 3.91 | 64.6 | 2 |
| scoped | 2 | 3.44 | 5.15 | 65.8 | 4 |

The codec saves bandwidth but costs server CPU. Three earlier repeated paired trials also had highly variable maximums on both architectures (see masked-capacity.json); no claim of eliminated frame stalls or increased hosting capacity. Live server work timings in the snapshot stop before encoding; arrival gaps also include queuing, network I/O and test-client decoding. The separate CPU benchmark includes serialization.

## Remaining limits and next work

This is not a zero-lag guarantee. Earlier isolated runs reproduced substantial
CPU spikes inside the physics section, which also includes post-step abilities.
Diagnostic substep timings implicated both custom vehicle forces and Rapier on
different runs; no single stable root cause was established. A broad floating
point flushing experiment did not consistently improve tails and was rejected.
Its code/dependency modifications are not included.

In the delivered build, tires-on and tires-off combat soaks both passed reconnect and backfill checks. The one-minute tires-on run had per-world maximum physics sections of 516 and 371 ms and an arrival gap up to 698 ms. The two-minute default-off run peaked at 139 ms between arrivals. Different collisions and scheduling can dominate these short runs; these numbers do not isolate the thermal algorithm. Capture repeated identical input replays with per-substep profiling before assigning blame or changing the default.

The next performance gate is a sustained hosted 5v5 session with real browser GPU
timings and injected WAN delay/jitter/disconnects. Capture a CPU profile around
slow world ticks, and separate force calculation, collision/solver, abilities,
encoding, browser decoding, React and GPU time. Asset decoding/loading and draw
calls remain separate possible client freeze sources. Do not reduce physics
fidelity or deform vehicle LODs based on network measurements alone.

Snapshots at 30 Hz have nominal spacing of 33.3 ms rather than 16.7 ms. Some
fields intentionally repeat while different from an immutable baseline. This
avoids per-client acknowledgement history and makes latest-only queues safe.
It reduces traffic, not physical internet propagation time. Legacy clients keep
the original snapshot/input behavior until their frontend is updated.

Boat buoyancy, drag, propulsion and steering remain outstanding. Current coastal
water is visual and carrier/fleet decks are static. Full structural soft-body
vehicles would be a separate multi-month effort (a planning estimate), including
per-vehicle rigs, crash stability, authority and replication; cosmetic damage is
a smaller first step. No boat or soft-body simulation is claimed by this patch.

See NETWORK-SNAPSHOT-PROTOCOL.md for the transport contract. The checked installer
targets `C:\Users\uriel\Projects\AvenLab`, preserves unknown edits and includes
the preceding 5v5/garage/header patch. It performs no push or deployment.
