# useCabinTime

This local external store supplies the climate clock. It reads local time on subscription and visibility changes. While at least one component is listening and the document is visible, a shared timer samples every 30 seconds. Listeners are notified when the formatted hour/minute changes. The timer stops while hidden and after the last unsubscribe.

[Implementation](cabinClock.ts) · [All store update rates](../README.md)
