# Shared cockpit and driving styles

`../driverConsole.css` is the stable entry; `index.css` imports these feature owners. Component APIs stay in their sibling feature `index.ts` files.

| File | Owns |
| --- | --- |
| console.css | Shared radio/HVAC frame, head-unit tabs and neutral/contact feedback |
| radio.css | Radio display, round transport/volume artwork and power switch |
| climate.css | Clock, centered round hazard switch and rotary knob artwork |
| wheel.css | Wheel artwork, painted steering hit regions and reduced motion |
| layout.css | Console footprint, peer brake/shifter sizing and mobile landscape density |
| mechanical.css | Gate targets, parking grip, optional crystals and assist bank artwork |
| stalks.css | Lever thickness and button faces; polar geometry belongs to `stalks/geometry.ts` |
| ignition.css | Ignition ring, held sweep, crank feedback and position beside the console |
| panels.css | Full cockpit diagrams, feature selectors and preference controls |
| switches.css | Shared pedal/assist contact faces and silver assist switches |

`layout.css` is imported last. Set responsive dimensions there instead of adding another width or scroll override to a feature file. The shared width is three pedal widths, their two gaps, a 72 px assist bank and a 5 px separation. Radio and HVAC use that footprint. The default three-switch bank retains its 23.5 px switch height; the optional expanded bank retains 49 px overall height.

The full cockpit keeps a 140 px shifter. The driving HUD uses 112 px, then a viewport-height-based 64–112 px gate in landscape up to 500 px tall. Parking uses the same parent height and 85% artwork height; its pivot stays at 75% of its panel. Smaller gate targets scale with the gate. Landscape HVAC knobs shrink independently of the full cockpit page. Portrait equipment reserves clearance above the wheel.

The driving equipment has no scroll container. Menu pages still scroll by touch, wheel and keyboard while scrollbar chrome stays hidden. Test the **full HVAC, open minimap and all driving groups together**, including 568×320 and 844×390, after changing density. Expanded missions remain menu content and may require normal menu scrolling.

Physical contact uses `data-hud-held`; `aria-pressed` and the radio power switch's `aria-checked` expose function state. Release must remove contact feedback even when a button keeps keyboard focus. Theme tokens come from `theme/catalog.ts` and `theme.css`; semantic warning colors remain independent. No layout measurement or per-frame React loop is needed.
