# Component standard and appearance patch — first pass

This patch builds on 54fcc61 (the collider excavation patch). It adds serial, cached portrait rendering for late-arriving peer styles, finish-specific remote vehicle batches, and saved-layout environment portraits. Selection uses your account's loadout; match portraits use each entity's published appearance. Explicit paint targets now cover Charger, Enforcer, Skyline and Timecar as well as the existing supported cars. Unmapped materials, seats and liveries are not claimed as customizable.

Environment cards reload installed documents on mounting and first use the local saved editor layout when present. A carrier added and saved locally is visible next selection. These are collider silhouettes, not photorealistic GLB renders. Other clients' unpublished editor drafts and server-only editor revisions are not refreshed by this patch.

## Model export

Run `node scripts/standardize-glbs.mjs --output <new-directory>` from a hydrated checkout. It exports all tracked GLBs it can read, reports inaccessible LFS pointers, and exits with status 2 for an incomplete batch. Never run the output over your production models. Existing model checksums bind colliders to source files; adoption of the exports requires a separate catalog migration.

The delivered exports cover 164 of 246 tracked GLBs. 82 sources remain unhydrated LFS pointers after a stalled download. `component-report.json` lists every outcome and each unclassified mesh. This is a metadata/hierarchy foundation, not complete manual rigging of every vehicle.

Schema 1 uses:
- `AL_ASSET_<scene>`: identity scene wrapper.
- `extras.avenlab.id`: stable index-based ID within this revision.
- `extras.avenlab.canonicalName`: `AL_<ROLE>_<INDEX>`.
- `extras.avenlab.role`: exact known wheel pivot/spin/caliper, turret/barrel, headlight or rotor role; otherwise `unclassified`.
- `extras.avenlab.sourceName`: original authored name, retained on named nodes for existing animation/runtime consumers.

Unnamed nodes/materials receive unique AL names. Existing named groups, mesh data, compressed buffers, textures, transforms, animation channels, skin joint indices and pivots are preserved. No seat, door, rotor or wheel is split out of a combined mesh automatically. Unclassified objects need visual authoring review before assigning operational roles. Material IDs are standardized but material roles remain unclassified.

## Verification and limits

Source checks cover binary geometry preservation, unchanged pivots/animation/joints, migration idempotence, malformed GLB rejection, local environment reloads and explicit paint isolation. TypeScript passes. A Windows installer and live multiplayer/GPU performance have not been exercised here. Live custom portrait bakes are delayed and serialized but may still cause a brief loading hitch on slower hardware.

The GLB exports are separate from the code patch to keep checksum-bound colliders operational. The production GLBs are not replaced automatically. Full migration remains blocked on the missing source bytes and manual classification of ambiguous geometry.
