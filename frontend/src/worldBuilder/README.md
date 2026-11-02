# Universal world editor

document/ is pure schema/geometry; state/ owns drafts/history/preferences; panels/ owns authoring UI; scene/ owns preview rendering. roads/, models/, vehicles/ supply asset-specific geometry/catalogs.

## How to edit

Editing world in the header is the single source-map selector. District display title under Files labels the draft only; the displayed Map ID controls the save slot and server filename. Coastal District has its own registered map ID, source file and browser drafts. Generating from a test world switches to Coastal District and preserves the test draft. See docs/COASTAL-WORLD-ROADMAP.md for legacy coastal import recovery and installation. Header Inspector hides/shows the right sidebar; Minimize changes its width. Inspector tabs separate Selection, Spawns, World, Scene, Snapping and Files. Use [editor guide](../../../docs/UNIVERSAL_WORLD_EDITOR.md) and [spawn guide](../../../docs/SPAWN_EDITING.md).

World catalogs are generated from installed Rust assets by scripts/sync-world-builder-map.mjs. Do not hand-edit the generated maps.json. Add a matching schema-2 <map_id>_colliders.json, then dev auto-refreshes or build/redeploy production. metadata.name and metadata.description label the entry. Rust validates/discovers installed files on demand. Browser-only drafts do not register as server worlds until exported and installed.
