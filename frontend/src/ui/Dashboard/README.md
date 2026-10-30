# Instrument cluster

Dashboard.tsx composes independently subscribed gauges. dashboardModel.ts / gaugeGeometry.ts derive scales and sweep geometry. InstrumentLights.tsx uses confirmed cluster flags. ResourceRings.tsx uses authoritative resource availability.

## How to edit

For a new gauge, project validated telemetry in store/telemetry, then subscribe only that gauge. Keep m/s→km/h and temperature conversions at the projection/display boundaries. No instrument writes to physics or creates a polling loop.

`dashboardModel.instrumentBrightness` combines saved `preferences.dashboardBrightness` (0.1–1) with confirmed engine state. Engine off multiplies that gain by 0.42; running uses the saved gain. High contrast bypasses automatic dimming and still respects manual brightness. Dashboard.tsx applies the resulting static filter without a telemetry timer or per-frame state. `index.ts` exports this helper. Cockpit → Brightness previews the real Dashboard, adjusts the same preference, and shares `hudGroups.gauges` with Settings. To change dimming, edit the helper; to edit the range/preview, use `ui/Cockpit/panels/BrightnessPage.tsx`.
