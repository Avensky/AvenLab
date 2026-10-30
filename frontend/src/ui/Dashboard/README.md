# Instrument cluster

Dashboard.tsx composes independently subscribed gauges. dashboardModel.ts / gaugeGeometry.ts derive scales and sweep geometry. InstrumentLights.tsx uses confirmed cluster flags. ResourceRings.tsx uses authoritative resource availability.

## How to edit

For a new gauge, project validated telemetry in store/telemetry, then subscribe only that gauge. Keep m/s→km/h and temperature conversions at the projection/display boundaries. No instrument writes to physics or creates a polling loop.

Engine-off dimming is owned by Dashboard.tsx's confirmed `data-engine-on` attribute and dashboard.css. Only stopped-engine instrument faces use brightness 0.42; running brightness is unchanged and high contrast retains full gain. This adds no telemetry timer or per-frame state.
