# Teammates, social groups and private worlds

The alpha UI update adds admission categories and changes the occupied-world
defaults below. See ALPHA_UI_AND_LOBBIES.md for current queue and role policy.

This update adds server-owned social profiles and isolated multiplayer sessions.
Open **Worlds & social** from Main, Pause or Settings → Social. Existing Sandbox
Start also joins a shared public session for the chosen map.

## Player flow

1. Profile: choose a player name and share your player code. The browser keeps a
   random guest sign-in key scoped to this server. Restore works on that browser;
   clearing its storage loses access to that guest profile. This is not an email
   account or cross-device account-recovery system.
2. Teammates: add an online player or enter a player code. The recipient accepts
   the request in Invites. Requests can be cancelled, declined or removed.
3. Groups: create a persistent social group with up to 10 members. The leader
   invites accepted teammates and removes members or pending invitations. Leaving
   hands leadership to another member; an empty group is removed.
4. Worlds: create a named session on an installed map, choose its player limit,
   choose listed/unlisted and optionally add a 4–64 character password. Create &
   Join opens the existing garage flow. A world keeps its map for its lifetime.
5. Invite an accepted teammate or your group from the current world. Copy/share
   creates a link containing only the world code. An invitation or code reveals an
   unlisted world but **does not bypass its password**. The owner can join their
   own world without retyping the password. Invitations expire after 15 minutes.
6. Owner actions: rotate the code to replace old links and pending invitations;
   delete an owned world after it empties. Leaving drops the vehicle immediately.

“Custom world” here means a saved, named multiplayer session using one of the four
installed maps: Streaming Endless City, Road & Jump Lab, Workshop Yard and Road
Precision. Uploading/publishing World Builder drafts, custom assets, group chat,
moderation, matchmaking and account recovery are not included. The editor remains
an authoring tool: export/install its map on the server before it can be played.

## Keyboard assist

Every new social text field has a KEYBOARD button. The on-screen keyboard supports
pointer/touch, D-pad movement, A to type, B to cancel, and LB/RB for letters/symbols.
Done commits; Cancel restores the field's starting text. Passwords are masked and
are not written to localStorage or invitation URLs.

Auto offers the keyboard until a trusted physical typing event is observed in the
current page. Its first character is preserved when focus returns to the input.
Browsers do not expose reliable keyboard attachment/removal detection. Use On to
always offer assist or Off for native entry; the explicit button works in any
mode. Opening assist releases driving input and has priority over menu actions.
The same preference is available under Settings → Accessibility.

## Server configuration and persistence

Rebuild **both** Rust and frontend; this is a protocol/backend change. Cargo.lock
includes Argon2 and SHA-256 dependencies. Run from the server directory:

```sh
cargo test --locked
cargo build --release --locked
cargo run --release --locked
```

| Environment variable | Default | Meaning |
| --- | --- | --- |
| `AVENLAB_BIND` | `0.0.0.0:9001` | WebSocket listener |
| `AVENLAB_SOCIAL_PATH` | `avenlab-server/runtime/social.json` | Persistent profile/group/world metadata file |
| `AVENLAB_MAX_ACTIVE_WORLDS` | `3` | Occupied runtime worlds, clamped 1–16 |
| `AVENLAB_MAX_PLAYERS` | `12` | Total joined players across worlds, clamped 1–160 |
| `VITE_RUST_WS_URL` | existing host-based fallback | Frontend WebSocket override, set at build time |

Use HTTPS/WSS through your normal reverse proxy for internet deployment. The
server binds plain WebSocket; TLS termination remains a deployment responsibility.
Back up the social file and keep it private. It stores salted Argon2id password
hashes and SHA-256 hashes of random guest credentials, never plaintext passwords
or guest keys. Saves use temporary-file replacement with Unix file mode 0600.
The runtime directory is ignored by Git and excluded from this package.

Saved worlds retain metadata only. Their vehicles, physics state and ticks are
not a save game. The last departure unloads the runtime, and rejoining rebuilds
it. Limits are 8 owned worlds per profile, 256 saved worlds per server, 8 groups
per profile, 100 teammates per profile and 1,024 stored guest profiles per server. Data-load and invitation counts are
bounded. Names are display text; server authorization uses the connected profile.

The physics scheduler remains one 60 Hz owner, with the existing physics substeps.
Each occupied world has separate maps, bodies, clients and snapshots. Human-rate
social commands are serialized separately; password hashing, disk saves and map
loading do not hold the physics tick lock. Social/frame delivery uses coalescing
latest-value mailboxes. The server bounds command rates and WebSocket packet sizes.
An invited group prefers a teammate's side on joining when that side has capacity;
membership does not force current players to switch sides.

## Around $20 per month

The alpha configuration permits **one 5v5 match, one editor player and one
practice player**. These are operator limits, not a measured hosting guarantee. The city now has ten non-overlapping
spawn bays; small test maps have fewer bays, so a parked car may need to move away
before another can spawn. More worlds duplicate map physics and reduce CPU and
memory headroom. Empty saved worlds are much cheaper than occupied worlds.

As checked on 2026-10-30, DigitalOcean lists a Basic shared-CPU Droplet with 2 vCPU
and 2 GiB at $18/month, and 2 vCPU/4 GiB at $24/month, before optional services or
taxes: https://www.digitalocean.com/pricing/droplets . Use the $18 plan as a starting
candidate within budget; a dedicated CPU or 4 GiB instance may be appropriate if
real-world contention or memory use warrants it. A 2 GiB host may need a separate
build environment. The existing map loader resolves assets from the build's
server-source path; copying a bare binary elsewhere is not a complete deployment.

Benchmark the **actual rented instance**, using its release binary:

```sh
# --players is per world. These examples both simulate ten total cars.
./target/release/avenlab-server --capacity-bench --worlds 1 --players 10 --ticks 10000 --map streaming_endless_city --output one-world.json
./target/release/avenlab-server --capacity-bench --worlds 2 --players 5 --ticks 10000 --map streaming_endless_city --output two-worlds.json
```

The report measures aggregate per-tick physics/input/snapshot-serialization CPU
work after warmup, with p50/p95/p99/max against the 16.67 ms tick budget. A p95 below
12 ms is only a headroom heuristic. Run real clients through the production proxy,
check latency, deadline misses, CPU, RSS, bandwidth and reconnects for at least
15 minutes, and repeat during busy host periods. Only then try two active worlds
while keeping the total player limit at ten. Do not infer paid-host capacity from
this development machine's results. This synthetic benchmark does not measure
network egress, client FPS, arbitrary maps, prolonged play or shared-host contention.

## Verification

- Rust unit tests cover passwords, guest restoration, group permissions, world
  isolation, atomic admission, total player limits and runtime cleanup.
- `node scripts/test-social-worlds.mjs` starts a disposable local server and three
  actual WebSocket peers. Build the debug server first, or set `AVENLAB_SERVER_BIN`
  to the release binary. No running player server or real social contacts are used.
- Frontend tests cover invitation links, password target changes, request ownership,
  world-transition control clearing, independent social rendering and keyboard
  routing. Browser checks also exercised touch, physical typing and gamepad polling.
- The cumulative package retains the prior HUD visibility/brightness fixes. See
  `HUD_VISIBILITY_PERFORMANCE_UPDATE.md` for their audit.
