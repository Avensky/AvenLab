# Vehicle instruments and Rust resources

The uploaded custom designs are integrated in `frontend/src/ui/Dashboard/`:
dark speed face, white tachometer band, red needles, amber gear LCD and paired
fuel/temperature dial. NOS and condition/repair use thin horizontal meters below
the dials. Shared SVG geometry preserves those visual
features while removing independent canvas loops and the retired mutation store.

Enable **Settings → Display → Driving HUD & touch controls**. The three main
dials sit at bottom right, above the touch row on compact screens. Pedals are
bottom-center, steering bottom-left. Display saves KM/H/MPH and Pedals/Two
joysticks. Joysticks use left steering, right gas/reverse and a separate center
brake. Reduced motion disables needle transitions. Signal Recon does not mount
the driving HUD.

ABS/TCS buttons show confirmed enabled/disabled state. Amber OFF is distinct from
enabled; a dashed border means the input request awaits a server acknowledgement.
Keyboard Q/T and **Settings → Controller → ABS/TCS** offer the same controls,
including controller A/Cross activation. These are the existing tire-budget
assists. The cockpit adds a game-specific one-launch Sport traction policy;
factory VSC yaw/brake intervention is not simulated. See [cockpit reference](COCKPIT_UI.md).

## Simulation ownership and behavior

`avenlab-server/src/powertrain.rs` owns resources. `apply_vehicle_forces` advances
it once per fixed substep before the existing tire solver applies forces.
Rapier collision impulses are read after integration for damage. The healthy
base tire/suspension calibration is retained; no extra steering force, world
step or client resource simulation is added.

- Fuel consumption uses a drive-demand shaft-power estimate (torque × angular speed), BSFC in g/kWh,
  density in g/L and elapsed seconds. Idle burns fuel; high-RPM overrun cuts
  injection. Heavy acceleration burns more. Braking dissipates momentum; it
  does not directly subtract a made-up amount of fuel.
- Heat is an energy balance: engine work adds heat, thermal mass slows changes,
  thermostat/fan/airflow remove heat. Collision damage reduces cooling efficiency.
  Beyond the warning threshold power derates; critical heat cuts propulsion
  until cooling below the lower restart threshold. High heat also causes wear.
- Automatic driveline telemetry uses wheel-speed geometry, actual ratios,
  shift hysteresis and a launch-slip RPM target. A reverse request while moving
  the other way brakes before selecting direction. This is a lightweight
  kinematic automatic, not a complete crankshaft/clutch/torque-curve simulation.
- Collision impulse divided by body mass gives normal delta-v. Gentle standing
  loads/scrapes below 3.5 m/s do no damage. A 0.25 s impact cooldown prevents
  charging one impact repeatedly across contact substeps. Low condition reduces
  power/cooling; severe damage prevents propulsion. The scalar condition model
  does not simulate deformable bodywork or individual damaged components.
- NOS is finite (10 seconds on road profiles), adds up to 25% engine-force
  demand and consequently increases fuel/heat. It does not recharge automatically.
  The tank has no fitted NOS. Requested boost and confirmed activity are separate.
- Empty fuel, critical heat and severe damage gate actual tire-solver propulsion.
  Braking/steering remain available. Changing vehicle preserves fuel fraction,
  condition, temperature and remaining NOS fraction.

R / controller L3 / the Reset touch button recovers an upright pose on clear
road once per press. Recovery preserves supplies, wear and temperature, so it
cannot be used as a repair/refuel shortcut.

## Gameplay tuning

Authoritative profiles live in `powertrain.rs`; vehicle_setup assigns them.
Current road defaults are 50 L (Camaro 72, Supra 52), initial coolant 85°C,
warning 110°C, cutoff 135°C, restart 100°C. Fuel gameplay multiplier is **12×**
for road profiles and **22×** for the tank. Heat generation multipliers are
**1.35×** and **1.5×**. These deliberately compress logistics into a match;
they are game tuning, not factory fuel economy specifications. Adjust them
on the server rather than consuming resources in a UI timer.

**Debugger → Vehicles & GLBs → Sandbox service** repairs, refuels, cools and
recharges NOS for training. Rust validates local ownership, engine requested Off,
speed at most 0.5 m/s and ground contact. It retains position and keeps the
engine Off. This is a debug maintenance action. Gas stations, station access,
supply costs, competitive service authorization and persistent vehicle state
remain future match systems; the current sandbox server has no CTF match mode.

## Wire and stores

The existing native WebSocket still carries JSON with packed u16 vehicle/player
flags and u32 debug requests. Continuous values are numeric. Vehicle flags now
include BOOST at bit 7. The new resource status packs starting/hot/low fuel/
empty/damaged/heat-lock into `resource_mask`, rather than adding six booleans.

Vehicle setup config now contains a `hud` calibration block: availability mask,
max/redline RPM, fuel capacity and temperature limits. Road availability is 63;
tank is 47. Bits: RPM=1, gear=2, fuel=4, temperature=8, NOS=16, condition=32.
Calibration is sent on first spawn and vehicle change, not repeated per tick.
Snapshot additions are `condition` (0..1), `boost_fraction` (0..1 or null when
unfitted) and `resource_mask`. Existing speed/RPM/gear/fuel/temp/torque fields now
carry model values in m/s, RPM, -1/R 0/N or positive gear, liters, Celsius and N·m.

`vehicleConfigStore` owns low-frequency calibration. `vehicleTelemetryStore`
samples only the local entity at 20 Hz and suppresses unchanged rounded values.
Raw snapshots stay at their existing 60 Hz target; physics substeps are 120 Hz.
Hidden/unmounted HUDs have no display sampler. Values blank after 500 ms without
fresh data, disconnect or missing local identity. Old servers without availability
show unavailable resource readings instead of interpreting zero placeholders.

Touch has independent input sources and pointer capture. Cancel, blur, hidden
tabs, disconnect, layout changes, menus, terminal/recorder focus and unmount
release transient intent. Releasing one joystick cannot erase a held brake or
keyboard input. The input sender stays the only 60 Hz transport writer.

Captures include gauge calibration and start/end resource state. Changing fuel,
temperature or condition does not invalidate the recording context on every
packet; changing calibration does. See [store guide](../frontend/src/store/README.md).

## Legacy lessons and next drivetrain work

The old Node attempt stepped the world twice, used per-frame decay rates,
multiplied fuel use by gear index and had several RPM writers using inconsistent
fuel state. Its cooling path could read a missing speed field. The Rust version
uses one clock and one state owner with explicit units and dt-based rates.

The cockpit now has a draggable assisted manual selector with server-owned gear
requests, plus automatic mode. A clutch and full torque-curve model remain further
work. Factory VSC yaw control remains separate from the game's Sport traction rule.

Tests cover fuel/thermal rates, timestep independence, heat/fuel cutoffs, NOS,
impact damage, actual Rapier collisions, service gates, assist limits and HUD/
input ownership. The original integration was checked with Rust WebSocket data;
the revised cockpit's native rendering is unverified because this environment
blocked local Chromium. The included preview uses sample data, not a physics or
phone-FPS benchmark. Rebuild/restart Rust and rebuild the frontend together.

Final checks: **150 frontend tests** and **47 Rust tests** passed with no skips
or failures. Full ESLint, TypeScript/production frontend build and optimized Rust
release build passed. Existing Rust warnings and Vite's large-bundle advisory
remain. Browser layouts cover 320×240, 568×320, 390×844, 844×390 and 1256×624;
real multi-touch, saved layouts/units and a live Rust WebSocket session were
exercised. No target-phone FPS gain is inferred from these UI checks.
