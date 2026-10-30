# Editor state and persistence

layoutStore.ts owns authored document, selection, spawn edits, undo/redo and browser save. builderStore.ts owns the source/collision-template draft. builderActions.ts switches worlds with race protection and independent sessions. editorPreferences.ts owns local style/LOD/inspector visibility.

## How to edit

Commit document edits through layoutAction + layoutStore actions. Keep selection/cursor/view choices outside the saved map. Spawn edits use the same history as pieces. Preserve storage keys and per-world session ownership. Changing LOD/theme/sidebar never changes colliders or the running world.
