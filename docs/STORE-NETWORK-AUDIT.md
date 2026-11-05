# Networking and frontend store audit

The [store index](../frontend/src/store/README.md#store-update-rates) links to a README for each of the 43 exported frontend Zustand stores. Each guide lists its state fields, who writes them, and when a consumer should expect an update. The index also covers the external cabin clock, portrait/artwork subscriptions and OS motion preference. Local event-driven stores may be idle for an entire match.

## Packet and display frequencies

| Producer or consumer | Expected frequency | Who needs it |
| --- | --- | --- |
| Rust vehicle simulation | 60 ticks/s target | Server |
| Motion and combat snapshots | Up to 30 Hz compact or 60 Hz legacy | Players in the same world and permitted visibility group |
| Driver telemetry | Changed ordinary readings up to 10 Hz. Cockpit, cabin, parking-brake and cruise transitions may arrive on the next motion publication | Owning driver |
| Driver input | 60 Hz default sampling while deployed, alive and visible. Repeated compact input refreshes after 100 ms | Server |
| Wheel and chassis diagnostics | Up to 10 Hz on request | Requesting player and selected scope |
| Maps, vehicle setup, social views, chat and results | Admission, change, request or confirmed event | Authorized recipients in the corresponding channel |
| RTT and transport liveness | Application ping checked every 5 s. WebSocket protocol ping every 8 s | Connection |
| Cockpit gauges, minimap pose, scoreboard rows | Respectively up to 20 Hz, 10 Hz and 4 Hz | Local display consumers. The scoreboard samples while open |
| Cabin FPS, cabin clock | FPS publishes changed readings up to 2 Hz. Clock checks every 30 s with visible subscribers | Local display only |

For field masks, decoder recovery and legacy fallback, see the [wire protocol](NETWORK-SNAPSHOT-PROTOCOL.md).

## Repeated work removed

A social publication formerly discovered and validated installed collider maps once per identified recipient. A 20-player publication in this checkout could parse the same six candidate files 20 times. Map discovery now runs once per publication on a blocking worker before taking the social locks. The server indexes world membership once and publishes member details and invite codes only where permitted. Each manual refresh considers only its requester. Career reads return their response directly. Editor tuning and vehicle revival use their existing gameplay or configuration channels. Membership and profile changes still update other affected views.

On the client, the mission radio keeps the few score and flag fields needed for older servers. Repeated objective histories skip sorting. New events are ordered and deduplicated by sequence. The debugger shares the vehicle renderer’s roster selector and formats tire readings only when the requested wheel sample or player changes. Closed scoreboards skip session comparisons and repeated close writes. The gallery camera uses local vectors and an angle ref while orbiting, then saves the resume angle on exit.

## Measurements

Twenty identified localhost WebSocket clients ran 60 refreshes and 60 career-history requests per build per run, rotating the requester. Two runs per build used the previous Network and Tire Physics patch and this patch in alternating order. Times measure the entire request/reply round trip on this host.

| Action | Previous median | Patched median | Previous p95 | Patched p95 |
| --- | ---: | ---: | ---: | ---: |
| Lobby refresh | 16.52–17.38 ms | 1.22–1.38 ms | 21.93–27.88 ms | 2.77–3.09 ms |
| Career history | 16.82–18.15 ms | 0.24–0.30 ms | 22.39–25.94 ms | 0.56–0.81 ms |

Both builds emitted zero redundant social-state packets for unchanged views. The savings are in the work performed before responding. A subsequent listed-world creation still reached an unrelated viewer without its private invite code or member list.

A Node replay fed 10,000 snapshots with the same 16 historical flag events to the old and new mission observers. The old observer made 10,000 full-state clones. The new observer made zero, and both emitted zero new notices. A gallery lifecycle test advances 120 frames through the actual component, checks for camera motion and verifies zero game-store publications during the orbit and one save when it exits.

The production 45-second two-world 5v5 test passed with twenty moving players, mixed JSON/packed inputs, scoped entity visibility, reconnect and queued replacement. Quickplay received 27.7 snapshots/s and 0.197 MB/s per player. Competitive received 27.1 snapshots/s and 0.191 MB/s. Maximum arrival gaps were 1.46 s and 1.24 s respectively. The headless client event loop also paused for up to 1.19 s. These gaps combine server scheduling, delivery and client processing. Browser GPU frame time and internet delay require separate measurements.

## Grouped subscription replay

The frontend exposes [three read-only views of socket state](../frontend/src/store/session/networkViews.README.md). Connection and world identity drive menu subscriptions. Vehicle motion drives interpolation, combat and snapshot-driven HUD selectors. Requested diagnostic samples and RTT drive inspector and ping subscriptions. The original socket store still owns all writes. Each group attaches one source listener on first use and detaches on last unsubscribe.

The replay drove the previous Store and Network Audit build and the grouped readers with identical inputs. It applied 600 ten-vehicle snapshots, 200 wheel diagnostic samples and four ping samples while connection identity remained stable. Counts below measure calls to one subscriber in each group.

| Reader | Previous callbacks | Grouped callbacks |
| --- | ---: | ---: |
| Connection identity | 804 | 0 |
| Motion | 804 | 600 |
| Diagnostics | 804 | 204 |

An unchanged controller hold previously entered the packet builder 1,800 times across 600 polls for axes, boost and horn. With device arbitration grouped in [deviceAnalog.ts](../frontend/src/store/input/deviceAnalog.ts), the same polls entered it zero times. Both versions already suppressed identical input-store writes. Device releases, keyboard priority, a conflicting direct write and menu braking are covered by the regression suite.

Run `node --test tests/network-view-groups.test.mjs` from `frontend` to exercise these boundaries. The replay measures local work. The previous 5v5 transport measurements above remain the reference for network traffic. This patch does not establish a browser FPS or internet-latency improvement.

## Remaining work to profile

The server still builds full personalized JSON on genuine lobby changes, and refresh still validates the installed maps. The shared simulation still carries visible vehicle poses and wheels. The live CTF flag-marker component also builds JSON keys and derives detected contacts when a flag is carried. Capture browser CPU, allocation and render traces alongside server timings during a hosted fight before changing those cadences or vehicle detail.

## Reproduce

Build the release server and point `AVENLAB_SERVER_BIN` at the executable. From the repository root run `node scripts/test-store-traffic.mjs` for the twenty-client lobby test and `node scripts/test-snapshot-transport.mjs` for mixed transport and privacy. Run `node scripts/test-five-v-five.mjs` for the two-world test, setting `AVENLAB_SOAK_MS=45000` to match this run. Raw measurements and test logs ship with the ZIP.
