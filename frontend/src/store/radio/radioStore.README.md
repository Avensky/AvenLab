# useRadioStore

Owns local audio playback and radio feedback, including temporary weapon-change text.

**Expected updates** · Browser media and equipment events.

| State fields | Writer and lifetime | Expected update |
| --- | --- | --- |
| `track`, `title`, `artist`, `station`, `trackCount`, `trackIndex`, `playing`, `message` | Local playlist selection and Audio callbacks. | Per track, playback or status event. |
| `powered`, `volume`, `muted` | Radio and volume controls. Power also updates the corresponding input flag. | Per control change. |
| `equipmentNotice` | Temporary equipment message. | On notice, then once on a 3 s expiry timer. |

[Implementation](radioStore.ts) · [All store update rates](../README.md)
