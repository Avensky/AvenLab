# Controller reverse and rolling tank turns

## Controller

In automatic Drive, hold LT with RT and the legacy drive stick released to request reverse. Rust first brakes an opposing forward velocity to a near stop (0.6 m/s threshold) and then engages reverse. RT similarly brakes reverse motion before driving forward again. Do not expect an instantaneous direction flip. Release LT to stop requesting reverse.

Both triggers together retain forward throttle plus a separate brake request. Explicit manual gears and R/N/P remain explicit: LT is the brake, and RT drives the selected gear. The existing unarmed right-stick throttle/reverse input remains available. With weapons armed, the right stick stays dedicated to turret aim.

The normal menu/focus/device neutral gate still applies: holding LT while closing a menu cannot start reversing until released and pressed again. Keyboard and touch retain independent input owners. A negative drive request cancels Ram instead of allowing the active ability to override reverse/braking intent.

## Moving tank turns

Tanks can steer while moving. A stationary pivot rotates around the hull; a hard moving turn needs to shed speed and curve the travel path. The previous implementation retained almost no lateral track grip whenever steering and could allocate all effort to differential steering, leaving none to brake forward motion.

The revised track solver regains lateral grip with rolling speed, reserves common drive/braking effort while moving and progressively reduces the forward belt target at large steering angles. Full steering can counter-rotate the inside belt. Partial steering keeps substantially more forward travel for wider arcs. The existing ground-only yaw assist remains bounded; airborne thrust/steering is not added.

A regression drives forward at full throttle, then keeps full throttle while steering in each direction. It checks actual lateral path displacement, reduced speed and upright hull orientation, alongside the existing stationary pivot, reverse, braking, Ram and airborne tests. One test run slowed from about 13.7 to 3.6 m/s and curved over 8 m sideways in 2.5 seconds; these are flat-range test results, not universal limits.

## Validation and install

46 frontend checks pass, including real polled controller reverse, RT plus steering, both-trigger braking, explicit manual-gear preservation and menu neutral rearming. All 156 backend tests pass. TypeScript, changed-source ESLint and direct Vite build pass. No visual layout change is introduced; prior browser checks are historical rather than claimed as rerun.

Rebuild/restart both client and Rust server. Keep your original Git LFS assets and saved vehicle settings. Exact feel on physical controllers and different surfaces needs user feedback.
