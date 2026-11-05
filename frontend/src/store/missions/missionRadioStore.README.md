# useMissionRadioStore

Keeps the current mission bulletin and up to 12 recent bulletins. The CTF observer translates confirmed flag sequences into notices.

**Expected updates** · On accepted mission events.

| State fields | Writer and lifetime | Expected update |
| --- | --- | --- |
| `current`, `history` | Publish, clear or clear a source on world/round change. Repeated notice IDs are ignored. | Per new event or lifecycle clear. Several retained events can arrive in one snapshot. |

[Implementation](missionRadioStore.ts) · [All store update rates](../README.md)
