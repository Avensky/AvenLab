# World Builder: excavation and multilevel infrastructure

## Goal

Grow the World Builder from a placement editor into a road-and-terrain authoring tool. A map should represent three connected levels: canals and service routes below, city streets at grade, and elevated highways above. Tunnels pass through hills or under districts. The editor generates the visible surfaces and matching Rust collision geometry from the same saved layout.

The collider excavation tools and the first Harbor Exchange fixture are now implemented. See [COLLIDER_EXCAVATION_PATCH.md](COLLIDER_EXCAVATION_PATCH.md) for current controls, validation and limitations. The sections below retain the longer-term infrastructure goals; they are not a claim that every bridge variant or terrain system is complete. Imported road dimensions remain authoritative; the 200 m guide is not a road or chunk size.

## Shared infrastructure contract

Roads, bridges, ramps, retaining walls, tunnels, water, and supports should be saved as ordinary validated layout objects with stable IDs and explicit connections. The shared representation needs:

- A centerline with measured station positions and elevation, plus width, lane count, road surface, and grade.
- Elevation-aware sockets and join validation. The collision surface is the default elevation authority; authored overrides remain explicit.
- Separate road deck, support, and guardrail objects. A bridge deck stays drivable if an optional guardrail breaks; supports remain structural unless a later feature explicitly makes them destructible.
- Collision profiles and object connections shared by the client preview, export, and Rust server.
- Deterministic generation and seeded variation that preserve manual edits, source masks, hashes, and object IDs. A regenerate or excavate action should preview as one undoable edit.

Keep imported roads intact. Rebuild from their actual bounds and installed-map `cell`; do not cut or rescale a source road to fit the 200 m guide. Set `base: 'replace'`, `ground: false`, and `repeat: false` explicitly where required. Add supports only at authored support locations.

## Build sequence

### 1. Finish the placement patch and Road & Jump Lab

Use measured road modules and the existing wedge/floor/barrier pieces. Prove road seams, ramps, a real jump gap, landings, a missed jump, and a ground return with the BRZ and the real vehicle solver. Preserve the existing requirement that collision gaps are real; do not bridge them with invisible support. Capture the map through the normal editor/export/server workflow before extending the editor.

### 2. Curved elevated road kit

Create reusable straight sections, 45° and 90° curves, on-ramps, off-ramps, structural supports, and independent guardrail segments. Snap by elevation and connection sockets so a route can transition between street and highway without a visual or collision lip. Keep the roadway and rail widths independently editable.

The editor includes a resizable two-column concrete support pier and an open-ended urban underpass shell. The shell has solid sidewalls and roof, with no floor. The new excavation tool separately generates lined tunnels and physical road/canal cuts through box-based mountain fabrications.

The piece library also now includes low-poly mountain fabrications with size presets: a 24 m default segment, a 48 m segment, and a 72 m broad segment with different widths and heights. Add ordinary segments end-to-end to extend ridgelines. The pre-cut curved tunnel mass omits solid rock cells along a 90° bore sized for the measured H27 wide highway bend; place that road as a separate object so its authored surface and collision remain authoritative. These are block-based fabrication prototypes rather than arbitrary GLB boolean cutting, and repeated use should wait on collider/performance measurements.

A 72 m mountain-canal module now leaves a straight channel through the lower rock cells with a solid bed and separate water surface. Pair it with the **Waterfall · rock road blocker** at the route end and the **Waterfall lookout · boardwalk end** beside its plunge pool. The cliff is the visible solid blocker; the water curtain is non-solid. These pieces provide a static waterfall composition, not animated flow or water simulation for arbitrary maps.

Start with deterministic modular pieces rather than arbitrary mesh cutting. Validate joins, elevation continuity, ramp clearance, support placement, collision seams, and driveability on the Road & Jump Lab route. Exercise every curve and ramp with the actual vehicle solver; a visual preview alone does not establish a safe collision surface.

### 3. Canal excavation and waterway validation

Represent excavation as a saved profile operation along a path: centerline, width, depth, bank slope, and floor elevation. Use it to generate a matching terrain cut, seabed collider, water volume/surface, retaining walls, quay or service access, and bridge sockets. Water must occupy the canal volume while the seabed and banks provide the physical floor and sides; the water surface is not a hidden collision floor.

The old **Excavated canal profile** remains a static cross-section prefab. Use the new canal excavation tool for actual terrain cutting, a physical bed, retaining walls, and server-recognized water regions on finite standalone maps.

Allow the canal to be wider than the early placeholder so crossing choices matter in play. Author crossings as separate pieces: permanent stone bridge, drawbridge, destructible bridge, and jump bridge. Keep the permanent stone crossing separate from the destroyer route. Road decks, strong supports, and optional breakable rails remain separate objects so the roads can widen and rails can break independently.

Validate the complete profile in the editor and server: continuous seabed and banks, water bounds, retaining-wall joins, bridge clearance, ramp approaches, shore-to-water recovery, and no invisible collision across an open channel. Export and reload adjacent chunks to prove terrain and water transforms are applied once.

### 4. Tunnel generator

Start with two bounded templates:

1. A hillside cut-and-cover or bored passage with a measured entrance, continuous road surface, solid roof, and terrain above it.
2. An urban underpass beneath a street or raised road, with retaining walls, clearance, drainage volume, and explicit collision boundaries.

Tunnel generation must produce an actual opening through the terrain/building volume and a continuous collider inside it. Check entry and exit grades, vehicle clearance, lighting visibility, chunk joins, and the route above the tunnel. Underwater tunnels are a later feature after canal profiles, water pressure/containment decisions, and tunnel collision validation are reliable.

### 5. Harbor Exchange demonstration district

Build a compact finite test map that exercises the entire multilevel system in one place:

- A broad canal with seabed, water, retaining walls, quays, and the distinct bridge types.
- At-grade streets and service roads along the water.
- An elevated highway with straight and curved segments, ramps, supports, and independent guardrails.
- One hillside tunnel and one urban underpass.
- A route from the shore/service level to a bridge and to an elevated road, with alternate ways around a missed jump or closed crossing.
- A destroyer approach kept clear of the permanent stone crossing; reserve the ramp-to-deck rescue route for the USS Hawaii scenario.

Harbor Exchange is a proof map, not a city-size stress test. Load the same exported fixture in the World Builder, client runtime, and Rust server. Drive the road transitions and ramps, test each crossing state, inspect water/seabed contacts, and test a missed route with normal vehicle physics. Record frame time, memory, and collider counts before duplicating detailed pieces across larger streamed districts.

## Acceptance checks

- Placement, undo, save, import, and export preserve unique IDs, explicit support settings, road masks, source hashes, and finite-map settings.
- Connected route surfaces and their colliders agree at joins; no support silently spans an intended gap.
- Elevation changes, curve joins, ramps, bridge clearance, and tunnel entrances are verified with a real vehicle, not only gizmos or raycasts.
- Canal water, seabed, banks, walls, bridge openings, and recovery zones agree between preview and server collision.
- Guardrails can be selected and authored separately from road decks; a damaged rail does not destroy the structural support or roadway.
- Adjacent-chunk export/reload keeps elevations, cuts, sockets, and collider transforms aligned.
- Performance is measured on the same route before the map is scaled up or detailed pieces are instanced widely.

The older chokepoint creator and procedural-city work can build on these validated pieces. Do not combine this phase with arbitrary GLB cutting, underwater tunnel generation, a generic city solver, or unproven flight physics.
