# useHeroLoadouts

Account-scoped local cache of saved hero cosmetics and a garage draft.

**Expected updates** · On profile adoption, local edits and save.

| State fields | Writer and lifetime | Expected update |
| --- | --- | --- |
| `ownerId`, `defaultHero`, `loadouts`, `draft` | Hero workshop adopts the current profile, updates choices on save and clears the draft when the owner changes. | On profile/view change, edit or save. Rendered vehicle appearance can arrive separately in snapshots. |

[Implementation](heroLoadouts.ts) · [All store update rates](../../store/README.md)
