# useFrameReadout

Shows FPS and mean frame time in the cabin performance display.

**Expected updates** · Up to 2 Hz plus reset.

| State fields | Writer and lifetime | Expected update |
| --- | --- | --- |
| `fps`, `frameMs` | The R3F performance probe accumulates frames when driving with the relevant display enabled. Publishes changed rounded values. | After at least 500 ms of sampled frames. Resets when inactive. |

[Implementation](frameReadout.ts) · [All store update rates](../store/README.md)
