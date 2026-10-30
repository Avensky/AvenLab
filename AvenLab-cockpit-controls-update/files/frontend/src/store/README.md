# State ownership

`index.ts` is the stable public API; every section also has its own `index.ts`
and editing guide. Stores and catalogs are data-only. Internal files import
concrete dependencies; animation/transport loops read `getState()` or refs.
A selector should return only the value its component displays.

| Section | Writes / lifetime | Main readers |
| --- | --- | --- |
| [session](session/README.md) | Authoritative connection and vehicle setup | See section guide |
| [input](input/README.md) | Requested driving input | See section guide |
| [telemetry](telemetry/README.md) | Sampled display state | See section guide |
| [world](world/README.md) | Installed world and navigation | See section guide |
| [preferences](preferences/README.md) | Device preferences and accessibility | See section guide |
| [presentation](presentation/README.md) | Rendering and inspection choices | See section guide |
| [selection](selection/README.md) | Setup catalog and selected indexes | See section guide |
| [menus](menus/README.md) | Routes, overlays and menu navigation | See section guide |
| [recon](recon/README.md) | CAN research sessions and mission protocols | See section guide |
| [radio](radio/README.md) | Local media playback | See section guide |
| [missions](missions/README.md) | Gameplay mission radio presentation | See section guide |

## Change flow

Keyboard/controller/touch → input source merge → one 60 Hz sender → Rust fixed
simulation → validated network snapshot → one 20 Hz telemetry sampler → gauges.
The minimap takes a 10 Hz projection from that sampler. Clock updates are 30 s.
Menus are event-driven; opening Pause or the world editor holds the brake and zeroes
throttle. Device release cannot override that hold. Resume starts neutral.

World editor draft → validation → map export → install map JSON → restart Rust.
The live `worldStore.map`, setup selection, and authoring draft have separate
owners. Browser Save is not a live physics update.

Theme, visibility and controller preferences persist on the device. Simulation
state, media files, mission announcements and server identity do not persist.
Recon protocol edits keep `avenlab.signal-recon.protocols.v1`; all existing
preference/editor draft storage keys are retained.

For a new field, identify its owner first. Add a Rust field at the protocol
boundary, an input action for requested commands, a telemetry projection for a
displayed reading, or a preference for a presentation choice. Do not add a second
store holding copies of the same authority.
