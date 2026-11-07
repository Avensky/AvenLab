# Vehicle audio · original procedural first pass

The driving scene now has one bounded, spatial vehicle-sound mixer. These are
original synthesized loops, **not recordings of the named real vehicles**.
No third-party samples, online audio services, downloads, or new dependencies
are needed while playing.

## Included

- Four-cylinder, boxer, inline-six, V8, heavy diesel and marine engine families.
  RPM changes loop rate; throttle/torque changes exhaust and intake layers.
- Grounded tire friction and road rumble; tank-track rattle and hull wash.
- Turbo spool and brief throttle-lift/gear-change blow-off for turbo profiles.
- Nitrous air flow follows the authoritative boost flag, including nearby cars.
- Stereo direction, inverse-distance attenuation and distance high-frequency
  filtering. Centered audio retains distance attenuation when stereo is disabled.
- A small shared feedback echo. Authored tunnel/underpass volumes increase its
  send; it is not acoustic ray tracing, wall occlusion, or a room simulation.
- Real local Audio settings for vehicle master, engine, tire, track/hull, turbo,
  nitrous and echo levels, directional audio, and a 2/4/6 vehicle budget.
  Cockpit radio retains its existing independent media player/volume.
- Ignition relay clicks now share the same context and vehicle master bus.

The default budget is four vehicles, with the local vehicle prioritized and a
small retention margin to avoid rebuilding voices when two distant cars trade
places. Cars beyond 220 m are not voiced. Known aircraft are excluded instead of
being incorrectly played as car engines; rotor/jet recordings or synthesis are a
separate package.

## Performance and lifetime contract

`VehicleAudioScene` mounts once inside the R3F scene. A 20 Hz imperative timer
reads current network/input/camera state; it does not subscribe React to telemetry,
set React state per frame, create a second render loop, raycast, or modify physics.

There is one shared `AudioContext`, one output limiter and one echo graph. Each
selected vehicle has four persistent native sources (engine, surface noise,
turbine and air) and reuses them as RPM/load changes. PCM loops are deterministic,
one second at 24 kHz, and cached once per family/context. Normal 20 Hz updates do
not create new audio nodes or append unbounded AudioParam automation.

The browser's first trusted input gesture unlocks sound. Hidden tabs suspend the
context and stop the timer. Menus, mode changes, stale snapshots (>400 ms),
disconnects and unmounts release vehicle sources and echo tails. Defeated actors
are excluded. Session/respawn changes reset drift/spool history. Mute releases
the vehicle graph, not just a visual setting. The shared context is closed by its
owner on hot reload, never by an individual effect.

Current wheel snapshots expose radians/sec, but their grounded speed is normally
assigned from rolling kinematics, not a tire inertia solver. Tire audio is thus
a **conservative grounded drift/slip estimate**, not a claim of physically solved
wheelspin. The drift derivative uses distinct snapshot receipt timestamps;
re-reading a packet preserves its estimate and respawns/teleports do not create
fake full-volume squeals.

## Reproduce and inspect the sound package

From the repository root, after installing frontend dependencies (Node 24):

```sh
node --test frontend/tests/vehicle-audio.test.mjs
node scripts/render-vehicle-audio-demo.mjs --out /path/to/audio-preview
```

The render script needs Chromium/Chrome, optionally passed with `--chromium`.
It generates nine original mono source-loop WAVs and one 20-second stereo demo
**outside the source tree**. The demo renders the actual runtime Web Audio graph
through `OfflineAudioContext`, including engine load, turbo release, nitrous,
tracks, tires, tunnel echo, a left-to-right pass and final session cleanup. It
also writes peak/RMS/channel-level metrics and fails if there is clipping,
inaudible output or stale sound after cleanup. It creates only a temporary,
isolated Chromium profile and never attaches to the user's browser.

When a CI/executor does not permit Chromium, `--pcm-preview` produces a portable
audition using the same original loops and scene fixture, with approximate
filters/mixing. Its metadata explicitly identifies it as **not a native graph
render**; this fallback cannot certify browser panning or AudioParam behavior.
The sound-budget/lifetime tests still exercise the runtime graph with mocked
native nodes. Neither kind of preview substitutes for in-game listening.

The runtime uses the same generated source functions directly; the WAV previews
do not need installing or storing in Git LFS. Levels are intentionally conservative
so several nearby vehicles do not dominate chat or produce clipping. A listening
and gameplay mix pass on headphones/speakers is still needed for final art quality.

## Manual checks

1. Start an engine, idle, rev, change gear and lift off a turbo car. Confirm load
   changes timbre instead of adding duplicate loops; verify nitrous starts/stops.
2. Drive the tank and a ship. Confirm track/hull layers differ from tire squeal.
3. Drift on the ground, then jump: tires must stop squealing in flight. Respawn
   must not emit a teleport-induced skid or old turbo burst.
4. Drive beside another client, move left/right and away. Compare Stereo and
   Centered-with-distance modes. Enter an authored tunnel and hear restrained echo.
5. Set each channel to zero, then Vehicle sounds Off. Leave/rejoin a world, pause,
   disconnect, and background/return to the tab. No stale loops should resume.
6. Switch the sound budget between 2/4/6 and compare FPS. The audio update never
   changes vehicle physics or the network packet cadence.
