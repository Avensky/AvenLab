# Ignition artwork and ring geometry

Public entry: `index.ts`. `../IgnitionSwitch.tsx` owns requests and gesture lifetime; `../starterRelayAudio.ts` owns one shared clicking-audio context.

| Export | Editing responsibility |
| --- | --- |
| IgnitionArtwork | Non-interactive SVG: cylinder, labels, progress arc and key |
| IGNITION_ANGLES / IGNITION_POSITIONS | OFF/ACC/ON/START detents and labels; not vehicle heading |
| IGNITION_LABEL_RADIUS / IGNITION_RING_RADIUS | Label radius 54 and outer light radius 61 |
| ignitionViewBox | Canvas bounds follow the outer ring with padding |
| ignitionTravelPath | The held sweep follows the outer ring, outside all labels |

To move the light farther outside the labels, change `IGNITION_RING_RADIUS`; the view box and travel path follow it. Appearance/flicker lives in `styles/ignition.css`. `heldPhase` is transient input; only confirmed Rust resource STARTING controls crank flicker and relay clicks. Released START springs to ON. Reduced motion uses steady light. Do not paint engine-running state from a click or add a second starter timer/network sender.
