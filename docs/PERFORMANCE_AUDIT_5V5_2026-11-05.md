# Two-world 5v5 and connection audit

Base: `ed34e1ebd93e2d413844f0427a7244972a5eec16`.
The delivery is cumulative with the sustained-combat and garage-theme updates.

## Delivered behavior

- The assigned RED or BLUE team is centered in the hero-selection header, in
  large italic lettering. The label appears only for the active selected match
  mode after admission. The garage retains the global theme. The shared header
  keeps its title and Back action, and hides the progression badge on narrower
  team-selection headers to reserve space for the team name.
- An upgraded WebSocket must identify within 30 seconds. Protocol pongs no longer
  allow an anonymous connection to occupy one of the 96 registered slots forever.
- Incoming messages are budgeted before application decoding: 240 messages/s
  with a 480-message burst, and 256 KiB/s with a 2 MiB burst. Invalid JSON, invalid
  packed input and control messages count too. The existing frame/message size
  bounds still apply. Budget exhaustion closes the connection; the usual reconnect
  and seat-reservation rules apply. The budget permits sustained 60 Hz, 2 KiB
  inputs plus one 1 MiB editor submission per ten seconds in the unit test.
- The frontend retries connections stuck in CONNECTING or awaiting welcome after
  15 seconds. Established silent menu connections also recover, without needing
  a deployed vehicle. Hidden-tab and foreground-grace handling remain intact.
- Socket registration no longer waits for the unrelated global control-operation
  lock before enforcing the live-client cap. Anonymous departures skip career
  persistence, reconnect reservations and rebuilding everyone's social views.
  Transport teardown starts before potentially slower world cleanup.
- Social-view construction indexes profile IDs once per publication, replacing
  repeated linear connection scans. Room occupancy and reconnect maintenance
  copy only the information needed instead of cloning whole connection records.
- The live matchmaking, admission and new 5v5 tests share one bounded test harness.
  It retains only the latest physics snapshot and a small message history, and
  cleans up its disposable server and data. This also avoids the test driver
  becoming an ever-growing snapshot archive.

## Verification

The live test uses the production release executable and actual WebSockets on
localhost. It launches Quickplay 5v5 and Competitive 5v5 simultaneously, with
twenty identified players, both JSON input and the frontend's production packed
input encoder. Its main input soak lasts 120 seconds, followed by reconnect and
replacement-player scenarios.

Passed checks:

1. Ten unique participants per world and five per team; the scored round waits
   for the tenth deployment. The two worlds and round identities remain separate.
2. Snapshots progress monotonically, all ten participants remain visible in their
   own world, inputs are acknowledged, and no active socket drops during the soak.
3. Malformed packet floods and byte bursts are disconnected. Eight unidentified
   upgraded sockets expire while identified players remain connected.
4. A valid reconnect restores the same world, team and hero without an eleventh
   body. Explicit leave permits queued backfill into the same running round.
5. A disconnected seat remains reserved during the configured grace period, then
   admits a replacement; an expired token cannot evict that replacement. The test
   shortens the grace period to four seconds; it does not change production policy.
6. The existing four-format matchmaking test passes, covering 3v3/5v5 isolation,
   capacity, role caps, queue admission, reconnect and backfill.
7. The socket-admission test passes: at most 32 incomplete handshakes, five-second
   expiry, then successful ordinary admission.

Rust: 314 passed, zero failed, one ignored. Frontend socket-liveness and session
recovery tests passed, as did ten shared-header/team-theme tests. The production
frontend build passed. Actual shared-header layout was checked at 1920x1080,
844x390, 390x844 and 320x568: the team label stays centered and the title, team and
Back action do not overlap. These are header checks, not a full in-game GPU audit.

## Performance results and limits

| 120-second live run | Quickplay 5v5 | Competitive 5v5 |
| --- | ---: | ---: |
| Server work p95 | 1.702 ms | 1.631 ms |
| Server work p99 | 4.171 ms | 5.989 ms |
| Worst server work | 450.467 ms | 365.063 ms |
| Physics-section p95 | 1.475 ms | 1.398 ms |
| Worst physics section | 35.657 ms | 364.241 ms |
| Snapshot-arrival p95 | 21.732 ms | 20.317 ms |
| Worst snapshot gap | 1115.303 ms | 999.385 ms |
| Received snapshot bytes/client/second | 1.648 MB | 1.646 MB |

Server work excludes the subsequent snapshot serialization. The physics section
also includes post-step abilities and round updates. Arrival gaps include server,
transport, host scheduling and test-driver processing; they are not a WAN ping
measurement. Server and test driver share this host.

Longer unpaced headless runs expose a problem missed by the earlier short runs.
Three 10,000-tick runs of one ten-player world had maxima of 23.74, 2378.39 and
515.97 ms. The 2378.39 ms sample consumed 2378.12 ms of thread CPU, with 2343.61 ms
reported in the physics section: that event cannot be explained by host
descheduling alone. Three two-world runs had maxima of 8.30, 47.83 and 29.12 ms.
Their p99 was 2.74–3.21 ms, but percentile performance does not excuse rare stalls.

An additional experiment rebuilt the query index after every physics substep
instead of allowing Rapier's incremental substep maintenance. Five one-world
and three two-world 10,000-tick runs still showed stalls, including a 720.34 ms
two-world tick. It did not provide a consistent improvement and was reverted.
The delivery retains the prior physics implementation. Experimental results are
included separately and must not be presented as delivered performance gains.

Three further 10,000-tick runs using temporary substep timing probes did not
reproduce the stall (maxima 8.25, 5.43 and 9.47 ms). This is not evidence that the
problem disappeared. Those results are in `diagnostic-capacity-runs.json`; probes
were removed from the delivered source. They did not isolate a narrower cause.

## Next alpha gates

1. Profile the rare long physics ticks further, preserving collision accuracy,
   suspension and continuous collision detection. Do not lower solver fidelity
   or hide nearby vehicles merely to improve average timing. Keep the worst
   ticks and CPU time as acceptance metrics alongside p95 and p99.
2. Reduce snapshot traffic. Around 1.65 MB/s per receiving player is still high
   (roughly 16.5 MB/s aggregate for a full world before transport overhead).
   Evaluate a negotiated compact snapshot and lower delivery cadence while
   retaining the simulation rate. Validate keyframes, missed packets, reconnect,
   authoritative cooldowns and compatibility before enabling deltas.
3. Run a thirty-minute combat and reconnect test on the intended host and real
   mobile GPUs. Capture main-thread long tasks, frame-time tails, GPU memory,
   geometry/shader uploads, simulation cost and network traffic together. These
   server tests establish neither mobile FPS nor a maximum hosting capacity.
4. Exercise deployment behavior through the actual TLS/reverse proxy, including
   idle timeouts, briefly unavailable upstreams and connection churn. Application
   limits do not replace proxy-level connection and request limits.

## Reproduce

```sh
cargo test --locked --manifest-path avenlab-server/Cargo.toml
cargo build --release --locked --manifest-path avenlab-server/Cargo.toml
npm --prefix frontend run build
```

Set `AVENLAB_SERVER_BIN` to the release executable, then run
`node scripts/test-five-v-five.mjs`, `node scripts/test-match-formats.mjs` and
`node scripts/test-socket-admission.mjs`. The 5v5 soak defaults to 120 seconds;
`AVENLAB_SOAK_MS` can set 5–300 seconds. It uses disposable local data.

From `frontend`, run
`node --test --test-concurrency=1 tests/socket-liveness.test.mjs tests/session-recovery.test.mjs tests/shared-menu-frame.test.mjs tests/match-team-theme.test.mjs`.

For headless timing, run the release executable with
`--capacity-bench --worlds 2 --players 10 --combat --ticks 10000 --cpu-timing --output capacity.json`.
CPU timing is available on 64-bit Linux; other targets report null CPU fields.
Do not run unrelated builds alongside timing measurements. Preserve every run,
including failures and outliers. `capacity-runs.json` contains the delivered
version's long runs; `substep-capacity-runs.json` is the rejected experiment.
