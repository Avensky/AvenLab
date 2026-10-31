# Alpha UI, mode selection and server admission

This cumulative update finishes the requested HUD layout and introduces the alpha
lobby flow. It preserves the previous social, mobile cockpit and HUD visibility
patches. Rebuild and restart **Rust and frontend together**.

## Main and hero selection

Main offers Play, Career, Worlds & Social and Settings. Play opens the existing
3D garage with Quickplay, Competitive, Sandbox, World Editor, Signal Recon and
planned Swarm Command. Quickplay/Competitive share the single match slot. The
selection screen keeps real teammate picks and the controller legend. Seven direct-select
portrait/name cards appear at the top right. Folder-style role filters sit above a
slim vehicle/environment bar directly against the footer; the old match-rule
strip and bottom quick-card wall are removed. The selected vehicle still rotates
in the existing garage. Lobby/Team chat uses the existing authenticated socket;
see `HERO_PORTRAITS_AND_CHAT.md`. Signal Recon opens its existing CAN
interface setup without joining a driving queue. A confirmed join reserves a seat; Deploy waits for Rust's spawn response.
H / Change Vehicle uses this same hero picker during a managed session and returns
to the current game without releasing its seat. Legacy sessions retain their
existing vehicle menu. Server-rejected picks retain the previous locked hero.

The alpha hero catalog uses the installed chassis:

| Role | Heroes | Chassis |
| --- | --- | --- |
| Tank | Vanguard | Tank |
| DPS | AE86, BRZ, Camaro, Supra | Corresponding installed vehicle |
| Support | Mechanic, Logistics | BRZ, AE86 |

Support role selection is available for testing. Repair/refuel abilities and
weapons are still gameplay work; role names do not claim those abilities exist.
Quickplay and Competitive enforce a five-player team: exactly one tank, two or
three DPS, and one or two support. Empty seats must still permit a valid final
composition. Group members prefer the same side when role and seat limits allow.
Duplicate heroes are allowed within those role limits. Solo/editor accept any
hero. An operator can set `AVENLAB_ROLE_LIMITS=0` for flexible composition testing;
these test sessions cannot award progression through the result adapter.

## Exactly three occupied world slots

| Slot | Population | Behavior |
| --- | --- | --- |
| Shared Quickplay / Competitive | 10 total, five per side | One selected mode at a time; another mode waits until this world empties |
| Editor physics | 1 | Isolated draft application and live driving tests |
| Solo / practice | 1 | Choose any installed environment; saved private worlds use this slot too |

The total default is **12 active players and three occupied worlds**. Waiting
players keep a lightweight connection and profile, not a physics vehicle. Saved
world metadata does not consume another occupied slot. These are configured
limits, not a measured capacity guarantee for a $20 host.

Tickets are FIFO within each slot category. A role-blocked ticket retains its
place, so later arrivals cannot bypass it. The queue screen displays the real
position and cycles the existing NIWC-Pacific and SEA-STRIKE videos, muted and
inline. Reduced-motion and unavailable-media cases use a static background.
No wait-time estimate is invented. If a waiting player's connection is lost, its
ticket ends; Rejoin Queue requests a new place when connected again.

Explicit Leave/Cancel releases a seat immediately. An unexpected disconnect
holds it for **30 seconds** by default; only the authenticated guest profile can
restore it. Vehicles are despawned during that absence. After expiry the server
unloads an otherwise empty runtime and promotes a queued player. A silent network
failure can take up to 30 seconds to detect before the grace window begins.
The frontend already sends application heartbeats every five seconds. There are
at most 96 connected sockets and 64 waiting tickets per process.

### Configuration

| Variable | Default | Meaning |
| --- | --- | --- |
| `AVENLAB_MAX_ACTIVE_WORLDS` | `3` | Overall runtime ceiling; category limits still apply |
| `AVENLAB_MAX_PLAYERS` | `12` | Overall active/reserved-seat ceiling |
| `AVENLAB_ALPHA_LIMITS` | `1` | Alpha category restrictions also cover direct/private world joins; `0` restores flexible development-world admission |
| `AVENLAB_ROLE_LIMITS` | `1` | Role rules for Quickplay/Competitive; `0` enables unranked flex testing |
| `AVENLAB_RECONNECT_GRACE_SECONDS` | `30` | Unexpected-disconnect reservation, clamped 1–120 seconds |

Old environment overrides still take precedence. For example, a previous
`AVENLAB_MAX_ACTIVE_WORLDS=1` prevents simultaneous editor/practice worlds even
though the new UI exposes their separate categories. In PowerShell, before launch:

```powershell
$env:AVENLAB_MAX_ACTIVE_WORLDS="3"
$env:AVENLAB_MAX_PLAYERS="12"
$env:AVENLAB_ROLE_LIMITS="1"
cargo run --release --locked --manifest-path avenlab-server/Cargo.toml
```

A Quickplay/Competitive alpha lobby currently uses Streaming Endless City,
which has ten usable spawn bays. Sandbox/editor can choose any installed map.
New user-authored maps still need installation in the server's approved catalog.

## Live editor testing

World Builder starts through hero/environment selection and reserves its dedicated
slot. In the editor, **Apply & Test Drive** exports the current layout and colliders,
validates them on Rust, builds a complete replacement world, and resets the test
vehicle in that world. Failure keeps the old world intact. The match and practice
worlds are untouched. F9 opens the editor again; edits stay as a local browser
draft until the next explicit application. Pointer movement never uploads maps.

Applications are bounded to 768 KiB, 256 authored pieces, 512 legacy boxes, 32
visual definitions and at most a 3×3 fixed grid or one-chunk streaming radius.
Assets remain installed model references. Map IDs, transforms, shapes and schema
are validated; clients cannot supply server filesystem paths. The WebSocket
transport accepts up to 1 MiB for this bounded editor action; other actions keep
the 16 KiB application limit. Applied physics is temporary, while the saved browser
draft/export remains available. Export/install the map for permanent deployment.

## Rank, prestige and milestone accounting

The career page and profile badge use persisted server data. Competitive win
milestones are provisional alpha balancing values:

| Tier | Competitive wins |
| --- | --- |
| Bronze | 0–4 |
| Silver | 5–14 |
| Gold | 15–29 |
| Platinum | 30–59 |
| Diamond | 60–99 |
| Master | 100–149 |
| Grandmaster | 150+ |

The separate driver level runs 1–100, then returns to 1 at the next prestige.
The prestige badge changes color and later cycles through its palette. Required
XP per level is `(100 + 10 × (level − 1)) × (1 + prestige / 4)`, rounded down.
A verified win grants 200 XP; a verified loss grants 100. Each ten-level milestone
grants five credits; a prestige grants another 25. Alpha skin vouchers cost
50/75/100 credits. The server validates ownership, spending and the chosen voucher;
redemption is persistent and cannot overspend or buy an owned voucher twice.

**The existing project has no completed-match scoring service.** This patch adds
its trusted result adapter, persistence and UI, but gameplay does not yet produce
verified wins or automatic rank/XP rewards. No client action can award itself XP,
wins or credits. Test driving and editor use award none. Result IDs are recorded
once so retries cannot duplicate rewards. Actual CTF rules, final result capture,
MMR/skill matchmaking, disconnected-player result handling, rewards balancing,
and vehicle skin assets/paint application remain next-stage gameplay work.
Vouchers are a server-owned inventory foundation, not a paid shop.

## HUD behavior

- Radio, GPS and climate share one layout owner. An expanded map occupies a real
  layout row and pushes radio down. With the map minimized, radio reaches the top
  edge and the circular launchers float beside it. Both minimized appear as small
  circles; minimized media/climate buttons move to free positions on the map rim.
- Radio's circular minimize control replaces its former expand arrow. Its tabs
  remain visible while open, and Missions drops below them. Cockpit → Radio saves
  Minimized, With Dials or No Tab Bar using buttons. A flag button beside radio
  power opens missions directly; GPS stays on the minimap. Minimized presentation
  removes transport controls while retaining title/power/missions. The circular
  minimizer collapses the entire widget. Neither turns off playback.
- Climate has a matching circular minimize button. Its requested HVAC state and
  hazard settings survive minimization. HVAC stays below radio at every size, including short landscape. Compact HVAC
  includes FPS, frame time and ping from existing render/connection measurements.
- Manual knob labels use a centered SVG H-pattern inside the knob. The metal
  e-brake tip is centered on the grip's top. Quick contact pulls the e-brake and
  releases with that pointer; holding changes to the existing progressive parking
  latch. Cancellation, hiding or leaving clears only its momentary input source.
- Visibility settings, radio power, brightness, precise parking pressure and
  previous source-aware keyboard/controller/touch input behavior are retained.

## Performance and verification

World simulation retains one 60 Hz owner. Queue expiry/admission uses a separate
human-rate task, never the physics tick lock. Input and frame mailboxes remain
replaceable; social changes publish only when their state changes. Minimized
media/map/HVAC bodies unmount. No extra simulation or input-sender loop is added.

For an exact alpha-sized CPU test on the rented host, build release and run:

```sh
./target/release/avenlab-server --capacity-bench --players-per-world 10,1,1 --ticks 10000 --map streaming_endless_city --output alpha-capacity.json
```

This tests twelve BRZs in three isolated city runtimes, including input sampling,
physics and snapshot serialization. It excludes socket egress, client rendering,
real hero mix, arbitrary editor geometry and shared-host contention. Run actual
clients and check RSS, CPU, tick deadlines and latency before increasing limits.
The included validation records local results only. No cloud server was rented.

See `UI_LAYOUT_REFRESH.md` for the current edge layout, style choices and sampling
rules. The frontend layout refresh does not change these server capacities.
