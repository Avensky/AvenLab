# Vehicle instruments and Rust resources

The custom designs use memoized SVG geometry in `frontend/src/ui/Dashboard/`:
dark speed face, white RPM band, red needles, stacked amber speed/gear LCDs and
mirrored fuel/coolant dials. Instruments sit above the bottom-left wheel: NOS around RPM, condition around
speed and blue ultimate around fuel/coolant. Engine-off needle parking is
presentation only; confirmed physical telemetry remains intact.

Enable **Settings → Display → Driving instruments**. Standard layout supplies
compact touch controls; Controller layout hides optional touch and Drive
switches. Independent visibility choices work in either layout. The lower-right
Drive console and **Cockpit → Drive** share ABS, TRAC, VSC SPORT and parking
controls. Keyboard/gamepad remain active with the buttons hidden. See the
[current cockpit reference](COCKPIT_UI.md) for layout, FR-S switch states,
stepped parking, ultimate attribution and packed protocol details.

## Simulation ownership and behavior

`avenlab-server/src/powertrain.rs` owns resources. `apply_vehicle_forces` advances
it once per fixed substep before the existing tire solver applies forces.
Rapier collision impulses are read after integration for damage. The healthy
base tire/suspension calibration is retained in Normal mode; no extra steering force, world
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
  condition, temperature, ultimate charge and remaining NOS fraction.

R / controller L3 recovers an upright pose on clear
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
max/redline RPM, fuel capacity and temperature limits. Road availability is 127;
tank is 111. Bits: RPM=1, gear=2, fuel=4, temperature=8, NOS=16, condition=32,
ultimate=64. Cockpit controls advertise `cockpit_version: 3`.
Calibration is sent on first spawn and vehicle change, not repeated per tick.
Optional v3 `cabin_mask` carries climate, key positions and temporary wipe state;
`cruise_target_kph` carries a confirmed cruise target. Snapshot additions are `condition` (0..1), `boost_fraction` (0..1 or null when
unfitted), `ultimate_fraction` (0..1), and `resource_mask`. Existing speed/RPM/gear/fuel/temp/torque fields now
carry model values in m/s, RPM, -1/R 0/N or positive gear, liters, Celsius and N·m.

`vehicleConfigStore` owns low-frequency calibration. `vehicleTelemetryStore`
samples only the local entity at 20 Hz and suppresses unchanged rounded values.
Raw snapshots stay at their existing 60 Hz target; physics substeps are 120 Hz.
The HUD and open cockpit share one display sampler, paused while hidden. No
mounted consumer means no sampler. Values blank after 500 ms without
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
work. Sport now exposes separate Sport/TRAC switch states, rather than a one-launch
rule. Factory VSC yaw control remains further work.

Tests cover fuel/thermal rates, timestep independence, heat/fuel cutoffs, NOS,
impact damage, actual Rapier collisions, service gates, assist limits and HUD/
input ownership. The original integration was checked with Rust WebSocket data;
the revised cockpit's native rendering is unverified because this environment
blocked local Chromium. The included preview uses sample data, not a physics or
phone-FPS benchmark. Rebuild/restart Rust and rebuild the frontend together.

Current checks are recorded in the delivered patch's APPLY.md. Native browser
and phone rendering remain unverified here; the interactive preview is provided
for normal-browser review. No target-device FPS improvement is claimed. Existing
Rust warnings and Vite's large-bundle advisory remain.
