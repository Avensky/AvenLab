# Menu motion preference

The menu video reads the browser reduced-motion media query through useSyncExternalStore. The OS change event triggers a refresh. This is a browser preference subscription with no polling or game packets.

[Implementation](MenuVideoBackground.tsx) · [All store update rates](../../store/README.md)
