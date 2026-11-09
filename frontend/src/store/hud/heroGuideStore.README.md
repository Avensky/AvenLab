# useHeroGuideStore

Tracks the deployed vehicle shown in the match guide and the overlay to restore on Back. The Customize tab reads the vehicle selected in Heroes directly.

**Expected updates** · On guide interactions.

| State fields | Writer and lifetime | Expected update |
| --- | --- | --- |
| `selectedHero`, `returnOverlay` | Opening Hero Abilities from the scoreboard. | Per guide open. |

[Implementation](heroGuideStore.ts) · [All store update rates](../README.md)
