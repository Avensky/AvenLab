# useSightCue

Stores the focused target and reticle tone used by the scope.

**Expected updates** · On a changed target/tone or clear.

| State fields | Writer and lifetime | Expected update |
| --- | --- | --- |
| `id`, `tone` | Vehicle marker visibility and relation checks run inside the render loop, reusing the visibility ray. The marker LOS interval is 100 ms. | Publishes on changed cue only. Leaving focus or losing visibility clears it. |

[Implementation](sightCue.ts) · [All store update rates](../store/README.md)
