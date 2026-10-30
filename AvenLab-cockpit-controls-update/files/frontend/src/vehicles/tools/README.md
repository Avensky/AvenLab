# Vehicle rig helpers

vehicleVisualRig.ts / supraVisualRig.ts and setupVehicleParts.tsx identify visual pieces; visualAlignment.ts and colliderPreview.ts relate them to measured setup. vehicleMaterials.ts repairs shared display materials safely.

## How to edit

Edit a rig helper when wheel/light parts are wrong; edit the vehicle component for assembly. Handling changes belong to Rust. Use source GLB bounds/config rather than patching camera or suspension offsets to hide an alignment error.

headlightBeam.ts changes the existing SpotLights' aim/intensity/range from
confirmed headlights/high-beam snapshots. It caches exact low-beam settings and
restores them on release, with no extra lamps, timers or React subscriptions.
AE86.tsx also adjusts its existing pop-up opening rate during a flash.
