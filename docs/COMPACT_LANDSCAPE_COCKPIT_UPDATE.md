# Compact landscape cockpit update

Base: `992f7cc37d8ad7af1f3758a458358fb2407838d1` (`updated hud`). This is an incremental frontend patch for the updated repository.

## Behavior

- Radio and HVAC use the same 220 px desktop footprint as the assist/pedal row, reducing to 211 px in short landscape and 190 px on narrow portrait screens.
- The driving shifter is 112 px and shrinks with landscape viewport height. Its parking peer keeps the same parent height and existing 85% lever artwork proportion.
- Radio transport and full HVAC controls reduce their height in mobile landscape so the open minimap can sit above them. The radio retains round buttons.
- Driving equipment fits without horizontal/vertical scrolling. Menus retain normal scrolling while scrollbar chrome is hidden throughout the app.
- Stalk rods increase from 3% to 4.6% of wheel diameter before face scaling. Caps and adjacent targets gain radial thickness without changing their angular positions.
- Cruise retains its 326° mount, 27% radius and adjacent buttons. Held travel is a shorter 4° arc; other stalks keep their 7° travel.
- Ignition moves closer to the console's left edge, shifting it right as the console narrows. Its artwork height now follows its actual width, including on phones.
- A radio power switch appears on the display in both driving and cockpit views. Off pauses audio and survives reload, retaining the current queue/position for power-on within the session. Local audio files still require selecting again after a page reload.

## Audit and ownership

The old console stylesheet mixed several generations of fixed widths, height breakpoints and `overflow: auto` layouts. Those superseded rules and unused button/temperature selectors were removed. Shared surfaces, radio, climate, wheel and responsive layout now have distinct owners, documented in `frontend/src/ui/Cockpit/styles/README.md`.

Radio start/stop cancellation is shared between power and transport. A saved off state and late media events cannot accidentally restart playback or restore the input flag. Geometry stays in the existing stalk helper; no additional polling loop or physics change is needed.

## Validation

Run `node --test --test-concurrency=1 tests/*.test.mjs`, `npm run lint` and `npm run build` in `frontend`. The existing cockpit preview supports browser layout checks with sample telemetry. Verify full HVAC, an open minimap and visible assist/pedal/mechanical controls at desktop, landscape-phone and narrow portrait sizes. These are browser UI checks; they do not benchmark gameplay or physical devices.
