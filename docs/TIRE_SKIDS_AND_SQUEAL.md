# Tire skid marks and squeal

Each grounded wheel can now publish its final collision contact, actual surface normal and a bounded skid intensity. Launch intensity is a proxy for excess drive demand above available tire grip with TCS disabled. Lateral intensity follows measured lateral contact velocity. Braking intensity follows the solver's lock state with ABS disabled, or a rear handbrake demand while moving. Unsupported/airborne, defeated and tracked vehicles do not emit road tire effects. Underwater contacts are suppressed where a coast water region is defined.

The physics model still sets visual wheel angular speed from road speed: it has no independent rotational tire inertia or measured longitudinal slip ratio. This patch adds presentation and telemetry; it does not claim to simulate real spinning rubber, wheel lock angular motion, tire wear, smoke, or different asphalt/gravel materials.

The renderer follows the vehicle interpolation timeline. Each wheel owns a short contact history; loss of contact, no skid, stale packets, abrupt changes of normal, respawns/teleports and vehicle/world changes break strips. Marks conform to hit normals and share one 2,048-quad ring pool. They fade after 35–45 seconds. Only the closest 24 vehicles inside 60 m generate effects. Marks are local visual history, so late joiners do not receive old rubber marks. Stationary burnouts do not repeatedly stamp a patch; a strip appears once the tire contact moves.

Tire squeal is original procedural filtered friction noise, mixed from nearby skidding vehicles. It is an initial sound, not an auditioned tire recording. It starts only after a mouse/touch/keyboard gesture, fades to silence with grip or stale data, and stops on hidden tabs/overlays. Settings → Audio has tire volume and skid-mark controls; volume zero mutes the tire channel. Existing global sound off is honored. Controller-only audio unlocking may require an initial tap/key press according to browser audio policy.

Compact snapshots now negotiate version 2 with an extra optional wheel contact tuple. The current client continues to decode version 1. Older clients use the existing JSON fallback with the updated server. Delta baselines retain their own version. Restart both frontend and Rust server after installation.

## Install and verify

Install after Street Mods + Drafting and Vehicle Grouping. Graded Excavation is compatible. Extract the package anywhere, including Downloads, then run Update-AvenLab.cmd and enter the repo path. Git checks the full patch before applying it and stops on incompatible local edits. No GLB or external sound downloads are needed.

Try: gentle acceleration (no marks), excessive launch demand with TCS off (driven tire marks), lateral sliding, hard braking with ABS off, and moving handbrake slides (rear tires). Check slopes, ramps, airborne wheels, respawns and remote vehicles. This is collider-driven and independent of GLB wheel names.

Automated checks cover launch gating, lateral/braking intensity, contact geometry on flat/sloped colliders, airborne suppression, trail breaks, bounded audio/lifecycle cleanup, v1/v2 decoding and delta recovery. TypeScript and Vite production bundle pass. GPU appearance, actual sound quality, live multiplayer balance and Windows CMD execution still need user testing.
