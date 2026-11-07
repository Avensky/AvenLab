# useNetworkStore

Owns the last accepted Rust snapshot and the current socket/world identity. Vehicle rendering reads this store directly. Gauges read a sampled projection.

**Expected updates** · 30 Hz compact / 60 Hz legacy arrivals, coalesced to at most one ordinary state publication per browser animation frame, plus immediate lifecycle/event channels.

| State fields | Writer and lifetime | Expected update |
| --- | --- | --- |
| `snapshot`, `tick`, `snapshotIntervalMs` | World snapshot and original local receipt time. Older or duplicate ticks are discarded, including ticks still pending publication. `snapshotIntervalMs` is the interval between published poses; raw network arrivals are measured separately. | Up to 30 Hz compact or 60 Hz legacy, bounded by render cadence. Initial poses and local body/vehicle/death/respawn/match-phase boundaries publish immediately. A finished round can stay silent. |
| `debugOverlay`, `debugTick` | Requested diagnostic channels for the current world. Own vehicle by default, all vehicles on explicit request. | Up to 10 Hz when requested and permitted. |
| `pingMs` | Measured from an application ping/pong round trip. | One pending ping at a time, checked every 5 s. |
| `connected`, `playerId`, `team`, `room_id`, `worldMap`, `worldName`, `spawn` | Connection, welcome, world-change and reset handlers. | On connection or world events. |
| `physicsData` | Compatibility packet accepted until an authoritative snapshot is present. | On a legacy physics packet. |
| `kind`, `x`, `y`, `z` | Compatibility slots initialized on session reset. Moving transforms live in snapshot.entities. | No periodic writer. |

[Implementation](networkStore.ts) · [All store update rates](../README.md)

The normal React read paths are [connection, motion and diagnostics](networkViews.README.md). The socket can continue using the same setters and reset actions.

The socket decodes every compact keyframe/delta and acknowledges input immediately. A one-slot [snapshot delivery queue](../../net/snapshotDelivery.ts) prevents a stalled or background tab from replaying an entire backlog through HUD subscribers. World changes and disconnects cancel the pending callback, including callbacks already ready to run. Wrong-world compact envelopes are discarded before they can replace the active decoder baseline. Transport diagnostics report dispatch time separately from decode time and count coalesced snapshots; neither number is a measured FPS improvement.
