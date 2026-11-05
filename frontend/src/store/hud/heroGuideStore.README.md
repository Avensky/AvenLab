# useHeroGuideStore

Remembers the selected guide entry and where to restore focus and garage preview when the guide closes.

**Expected updates** · On guide interactions.

| State fields | Writer and lifetime | Expected update |
| --- | --- | --- |
| `selectedHero`, `returnOverlay`, `returnGarageHero` | Opening, browsing or closing the guide. Currently deployed hero is consulted when opening. | Per guide navigation action. |

[Implementation](heroGuideStore.ts) · [All store update rates](../README.md)
