# Performance, notification and vehicle-audio patch

Source baseline: `44e077818390f02266859620b2d37bc52cda0a30` — the current pushed main commit. The installer merge retains the tire-contact v2 snapshot and tire-skid settings from that baseline.

This is an incremental frontend patch. It does not rewrite Git history, alter
the network wire format, change server physics, replace model binaries, or
regenerate installed worlds. It introduces no package dependencies.

## Concrete regressions addressed

- Live HUD portraits incorrectly treated cache-only as a delayed full 3D bake.
  They now use factory or already-cached art throughout gameplay. Pending menu
  jobs check again before loading and before allocating a WebGL renderer.
- Health-label sight tests traversed detailed mesh triangles. They now use
  bounded geometry-box tests, including individual instances. This is a
  conservative visual-label approximation: merged bounds can hide a label
  earlier than exact geometry. Server weapon hit tests are unchanged.
- Ordinary network snapshots could repeatedly publish obsolete states after
  a main-thread stall. One pending frame now keeps only the latest pose.
  First frames, local body/vehicle changes, death/respawn and match boundaries
  remain immediate. Input ACK and arrival timing stay on the receipt clock.
- A previous world's compact snapshot could mutate the current decoder's
  keyframe baseline. World identity is now checked before decoding it.
- A browser module imported the vehicle catalog from Vite's public directory.
  It now uses a generated src mirror of the same authored public catalog;
  predev/prebuild refresh it automatically.
- Three static docked hull components repeated GLTF clone/LOD logic. They now
  share a renderer and immutable local-transform policy. Fast loads only an
  available medium hull; Balanced switches at 160 m; Original preserves the
  prior full-detail ranges. Hawaii has no reduced LOD in the current catalog,
  so this patch does not pretend to add one.

## Notification behavior

Vehicle disabled, spawn protection, vehicle-ready and other gameplay prose
share one upper-screen lane. Each notice flashes, moves downward, and fades
after 1.6 seconds. There is no lower-screen status banner or buff explanation
popover. Numeric gauges, respawn rings, buff icons and essential controls stay.

- At most three visible notices; identical notices do not restart animations.
- Buff: green. Debuff: pink. Damage: red. System warning: amber. Informational
  system text: cyan. Rescue/objective tones remain distinct.
- Tap/click an effect icon for a temporary explanation in that same top lane.
- Existing notification category settings still apply. Muting a category
  discards its pending text; enabling it does not replay old messages.
- Hidden tabs, paused/loading menus, stale data and room/vehicle/match changes
  invalidate feedback. Async ability replies carry a session and age guard.
- Reduced motion uses a short stationary fade instead of downward travel.
- Shared feedback freshness uses one self-rechecking deadline, not another
  instrument sampler or per-packet timer. Ordinary pose packets do not render
  notification text or refresh the entire instrument console.

## Sound package

See `docs/VEHICLE_AUDIO.md` for the exact channel design and preview commands.
The sounds are original procedural synthesis, not authentic car recordings.
There are engine families, exhaust/intake load layers, tire/road friction,
tank tracks, hull wash, turbo spool/blow-off and nitrous. The mix includes
directional positioning, distance attenuation and authored-volume tunnel echo.

Settings > Audio controls the individual levels, mute, stereo direction and
2/4/6-vehicle budget. Four is the default; six is a hard cap. A shared context,
20 Hz control updates, reused native sources and bounded sample caches keep
audio separate from React's render cadence. No sound files are downloaded
during gameplay. Radio retains its own mixer. Aircraft audio is not included.

The packaged WAV audition is a portable approximation using the same generated
source loops. Native browser audio rendering was blocked by this test
environment's process/socket policy; the preview is not represented as an
in-engine recording. Actual browser listening and the user's GPU/network
performance still require an in-game check.

## Installation

1. Stop the frontend dev server and save open files. Keep the extracted patch
   in Downloads or another folder outside the repository.
2. Run `Install-AvenLab-Performance-Audio.cmd`. It accepts the repository path
   as an argument, otherwise checks the current directory and then the usual
   `%USERPROFILE%\Projects\AvenLab` location.
3. Review the dry run and confirm. The installer validates all merges before
   writing, saves originals beside the extracted patch, runs TypeScript and
   focused regression tests, and restores original bytes if validation fails.
   Conflicting edits are not force-applied. Concurrent edits are left intact
   and reported for manual recovery.
4. Restart the frontend with your normal command. No special Rust rebuild is
   needed for these frontend-only changes. Node 24 and installed frontend
   dependencies are required. The installer does not run npm install or Git LFS.

## First in-game checks

Use the same map, vehicle, camera location and graphics settings for comparisons.

1. With Vehicle sounds off, drive the harbor route that previously ran at 5 FPS.
   Wait for the initial asset load, then capture 10 seconds using F8. Open
   detailed performance data with Shift+F3. Compare frame p95, CPU submit,
   draw calls, RTT, snapshot age and store-dispatch time separately.
2. Trigger death, respawn, spawn shield and nitrous. Verify brief top notices,
   no bottom banners, and a functioning numeric respawn ring. Toggle a notice
   category off/on: old text must not replay.
3. Hide the tab, return, switch vehicles and leave/rejoin the world. Verify
   there is no stale notice burst or old engine/turbo/echo tail.
4. Turn sound on. Test idle, acceleration, gear changes, lift-off, nitrous,
   grounded drift, a tank and a ship. Drive past another vehicle, then move
   away and enter an authored tunnel. Listen for position, distance and echo.
5. Repeat the same 10-second capture with audio enabled at four voices. Use
   two voices if testing on a low-power device; report both captures if a
   significant regression remains.

`publishMs` measures synchronous store/subscriber dispatch, not full React/GPU
time. The coalesced counter counts obsolete pending movement snapshots, not
packet loss. An automated/headless test result is not a claim of restored
target-machine FPS or a reduction in actual network RTT.

## Audit validation and known limits

TypeScript, the Vite production bundle and the patch's focused regression
tests are checked separately. The first full-suite comparison ran 721 patched
tests: 651 passed, 65 failed and five were skipped. The unchanged baseline ran
690 tests: 613 passed, 72 failed and five were skipped. No failure identity in
that comparison was new to this patch. Existing failures include LFS pointer
files in place of GLBs, absent generated world caches, duplicate legacy asset
paths and older UI expectations. This does not make the entire repository test
suite clean. A later focused refinement also fixes the formerly failing
all-telemetry-hidden sampler test.

The bundle's `VALIDATION.md` records the final focused installer result. The
full playable world and native Web Audio output have not been profiled on the
user's machine. Capture evidence, rather than an assumed FPS number, should
decide the next optimization.
