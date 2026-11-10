# AvenLab Physics

A Rust vehicle-dynamics library built on Rapier. It supplies tire and suspension
models, steering, drivetrain response, and wheel diagnostics for games and
headless simulations.

## Try the tire lab

From this crate directory, run:

```sh
cargo test
cargo run --example tire_lab
```

The example puts a raycast wheel on a flat road at a prescribed chassis pose and
speed. It prints wheel load, load-bar fraction, tire temperature, gauge pressure,
traction-control activity, and the solved contact impulse.

## Package boundaries

| Owner | Responsibility |
| --- | --- |
| **`avenlab-physics`** | Chassis mass and ride geometry. Raycast suspension, spring and damper forces, anti-roll load transfer, Ackermann steering, combined-slip tires, ABS, traction control, and tire heat and pressure. Drivetrain gearing, torque, resistance, fuel, heat, and mechanical wear. Tracked drive and simplified hull forces. |
| **AvenLab server** | Rapier world and tick scheduling, map and vehicle presets, collision policy, spawning and respawning, driver input routing, multiplayer, abilities, damage and repair rules, refueling and boost reserves, and the wire format. Passes effective commands and modifiers to the models and applies their forces once per substep. |
| **Game UI and research tools** | Draw load bars, tire temperatures, pressure, skid marks and other readouts. Research owns telemetry capture, replay, and calibration against measurements. |

A road simulation samples contacts, updates each wheel's thermal state, resolves
axle loads, and then calls the tire solver. It applies the returned impulses at
their contact points before stepping Rapier. The server uses the final
post-anti-roll normal load for both the friction budget and the load bar. A
caller can read that load in newtons and choose a visual full-scale load. Colors,
geometry, UI labels, and telemetry transport are application decisions.

## Model and units

- Distance is in meters, mass in kilograms, time in seconds, force in newtons,
  and impulse in newton-seconds. The Rapier adapter uses +Y up and +Z forward.
- The spring rate is static wheel load divided by static sag. Damping uses the
  quarter-car estimate `c = 2ζ√(k m)`. Contact support is bounded before anti-roll
  transfer. The tire solver limits combined demand with a friction ellipse.
- Each tire heats with speed, scrub, and braking under load and cools toward
  ambient temperature. At constant modeled volume, absolute pressure scales with
  Kelvin temperature. The model reports degrees Celsius and gauge PSI, with a
  reference fill of 32 PSI at 25 °C. Temperature and pressure scale tire grip.
- Grounded wheel RPM in this model follows chassis motion. The ABS and traction
  controls use force demand and available contact grip. The raycast tire model
  approximates real tire behavior and does not integrate separate wheel rotational
  inertia. Hull lift is a spring-damper approximation around a water surface.

## First release scope

Start with the documented model APIs and the repeatable tire lab. Keep the
existing game behavior as the integration baseline while refining the public
API. A standalone vehicle builder, measured tire-compound calibration, and
flight dynamics are separate additions.

Before publishing, choose a license for the engine source, add the public
repository and author credit, and inspect the exact files with
`cargo package --list`.
