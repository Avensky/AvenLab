# useVehicleTelemetryStore

Feeds cockpit instruments with rounded readings and availability from the local body and its gauge configuration.

**Expected updates** · Up to 20 Hz while the HUD sampler is owned and visible.

| State fields | Writer and lifetime | Expected update |
| --- | --- | --- |
| `data` | One shared sampler projects movement, resources, assist masks, cabin controls, instrument power, position and heading. Publishes only changed output. | Every 50 ms while active, also on mount/visibility transitions. Snapshot age over 500 ms is stale. Ordinary driver readings arrive at up to 10 Hz. |

The single `data` object mixes several source rates. Position, yaw, speed, RPM, gear, boost, ultimate and shared combat/resource flags are available from accepted motion snapshots. Fuel, engine temperature, cockpit/cabin masks, handbrake and cruise target come from the driver-only lane. Ordinary readings arrive on change at up to 10 Hz. A cockpit/cabin, handbrake or cruise edge can arrive on the next motion publication. Gauge limits come from a separate setup event. A sampling tick can also change the freshness indicator or expire the instrument power grace period without receiving a packet.

[Implementation](vehicleTelemetryStore.ts) · [All store update rates](../README.md)
