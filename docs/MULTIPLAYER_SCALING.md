# Multiplayer growth plan

This is an architecture plan, not infrastructure deployed by this update. The
current patch runs independent worlds in one Rust process on one machine. Its
physics scheduler ticks the worlds sequentially, so adding CPU cores alone does
not spread those world ticks across cores. Process failure affects all worlds in
that process. The local social JSON is single-server storage, not a shared database.

## Names that otherwise get confused

| Term | Meaning |
| --- | --- |
| Machine / cloud instance | Rented VM or physical server with CPU, memory and network capacity |
| Game-server process / worker | Running Rust executable; a machine can run several |
| Match / world instance | Isolated gameplay state, map, roster and rules |
| Fleet | Pool of machines/workers with available capacity |
| Zone / shard | One part or copy of a persistent world, with its own simulation authority |

A dedicated **game server** is authoritative software running independently of a
player's client. It does not require dedicated physical hardware or a full VM for
every match. Several processes can share a machine; some software also multiplexes
several matches inside one process. AWS GameLift documents multiple processes per
instance (its standard managed integration hosts one game session per process).
Agones documents the alternative of multiple sessions per process:

- https://docs.aws.amazon.com/gameliftservers/latest/developerguide/fleets-multiprocess.html
- https://agones.dev/site/docs/integration-patterns/high-density-gameservers/

## Small modes such as capture the flag

Give each match a roster cap, mode/rules and an authoritative simulation. A
matchmaker/allocator reserves capacity on a suitable worker, then returns its
endpoint and a short-lived admission ticket. Clients connect to that worker for
real-time gameplay. When the match ends, write the result and recycle its slot.
Run several workers per machine where measurements permit. Separate processes
provide stronger crash and CPU scheduling isolation; multiplexed worlds can use
less idle memory. Neither implies one paid VM per match or hundreds of matches
per machine. Measure tick cost, memory, bandwidth and real client latency.

For planning: 1,000 simultaneous players in full ten-player matches require 100
active matches, distributed across a fleet according to measured capacity.
Partially occupied private worlds can require more matches for the same player
count. Registered accounts and monthly users are not simultaneous players.

## A large persistent world

Begin with a capped shared hub plus independent modes. If population eventually
requires an MMO, split simulation by geography (zones) and/or parallel copies
(shards), with authenticated handoff and durable player state. Only send each
client relevant nearby entities. One enormous map with every player receiving
every other player's state does not become scalable merely by buying more RAM.
Large crowds in one location remain a distinct physics/network scaling problem.

Blizzard describes layering/sharding as ways to handle population, but this does
not establish its private process-to-machine topology. A WoW realm should not be
assumed to equal one physical machine:

https://worldofwarcraft.blizzard.com/en-gb/news/23504702

## Free-to-play skins

Keep account identity and paid ownership outside disposable gameplay worlds:

- Account/API service: durable sign-in, social identity and ownership checks.
- Database: profiles, friends/groups, saved-world definitions, purchase ledger,
  skin ownership and equipped choices. Keep audit history and backups.
- Payment/store integration: server-verified completed transactions, unique
  transaction IDs and idempotent grants so retries cannot duplicate purchases.
  Handle refunds/chargebacks and use the target storefront's required payment flow.
- Gameplay workers: accept authenticated admission and validated equipped skin
  IDs; remain authoritative over movement, scores and gameplay rules.
- Asset hosting/CDN: serve cosmetic models/textures to clients. Selling a skin
  does not create another game world or require a new server for that buyer.

Do not trust a client message saying a purchase succeeded or that it owns a skin.
Do not store paid ownership only in browser storage or the current guest-profile
file. Shared accounts and reliable recovery are prerequisites for selling durable
items. A skin-only business model still pays hosting costs for every active user.

## Practical phases for AvenLab

1. Prototype now: one approximately $20 VM, three alpha slots (10 match players, one editor tester and one practice player)
   as the configured ceiling. Benchmark the actual machine; retain backups.
2. Before taking payments: durable accounts and database, purchase verification,
   entitlement checks, observability and tested restore/recovery. Services may
   initially share a machine while keeping separate responsibilities and data.
3. When a measured limit approaches: move gameplay to multiple Rust workers with
   unique bind ports and a central world registry/allocator. Move social metadata
   into the shared backend; never let workers overwrite the same JSON file.
   Add capacity without transferring live matches unless migration is implemented.
4. As concurrent usage grows: regional worker pools, queues, health checks, spare
   ready capacity, graceful draining and autoscaling based on free measured match
   slots. Scale down idle workers after matches finish. Budget account/database,
   asset transfer, monitoring and payment costs separately from gameplay VMs.
5. Only if the design needs it: persistent zones/shards and safe world handoffs.
   This is a larger architecture project than instanced capture-the-flag modes.

Recommended first commercial design: a capped social driving hub plus instanced
small modes, with one shared account and cosmetics service. Raise capacity based
on measurements rather than promising an unlimited persistent world.
