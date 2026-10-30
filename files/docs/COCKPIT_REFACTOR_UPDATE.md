# Cockpit controls update

This update makes contact feedback temporary, reduces the driving control bank,
and gives appearance and HUD visibility clear homes in the cockpit. The
cumulative download also includes the earlier organization/world-editor update
and removes its 123 obsolete flat paths after installing their replacements.

## Where to find the settings

| Cockpit tab | Controls |
| --- | --- |
| Drive | Realistic parking lever / simple P button; optional crystals (off by default) |
| Climate | Cabin temperature, airflow and fan; compact/full driving widget; HUD visibility |
| Research | Show/hide climate, emergency lights, wheel levers, ignition, GPS and mechanical HUD groups |
| Lights | Vertical right/left indicator arrows, light modes and emergency switch |
| Cruise | Right-mounted lever diagram and existing confirmed cruise actions |

The optional emergency-light widget is a centered triangle with a matching hit
area. The cockpit header retains theme/settings/navigation controls; it has no
duplicate hazard button. Climate uses three knobs at either driving size and
does not add expand/collapse arrows.

Pedal borders and assist switches use shared momentary feedback. Releasing a
press, cancelling it, losing focus or opening pause clears the contact marker.
Keeping the cursor over a released pedal does not retain a highlighted border.
`aria-pressed` still reports merged input/function state accessibly. Assist
switches have silver faces and black text/icons in every theme. Their 3 × 2 bank
uses approximately half-pedal-sized buttons.

The driving parking control applies immediate rear-brake force while held and
releases its own `touch-parking` source afterward. Separate numeric/crystal
detents retain intentional parking tension; the 0 target clears that latch.
Another keyboard/controller pull survives a touch release. The full Cockpit
Drive page keeps the slower parking ratchet gesture. Both appearances use the
same commands and accepted Rust brake state.

All three targets of each wheel lever share one circular radius. Holding the
lights cap for 220 ms flashes high beams; release restores the selected mode
without also rotating it. The ignition halo and held sweep sit outside all four
position labels. Cranking flicker/clicks continue to follow confirmed telemetry.

## Editing map

| Desired change | Start here | State owner |
| --- | --- | --- |
| Move a cap and its two adjacent controls together | `frontend/src/ui/Cockpit/stalks/geometry.ts` | Static `STALK_LAYOUTS` configuration |
| Change held/tap/drag behavior | `stalks/Stalk.tsx`, `stalks/commands.ts` | inputStore source intent, Rust confirmations |
| Change shifter, latch or driving pull | `mechanical/index.ts` and its README | inputStore; Rust gear/cable force |
| Change lever/button/crystal artwork | `mechanical/ParkingArtwork.tsx` | Local parking preferences |
| Change ignition ring/labels | `ignition/index.ts`, `styles/ignition.css` | Artwork geometry; confirmed cabin/resource masks |
| Add a cockpit page or change navigation | `panels/index.ts`, `tabs.ts`, `useCockpitNavigation.ts` | store/menus |
| Add/change saved HUD defaults | `store/preferences/hudVisibility.ts` | preferencesStore sanitizer and update actions |
| Change silver faces, text contrast or temporary borders | `styles/switches.css`, `useMomentaryFeedback.ts` | Contact markers only; function state stays separate |
| Change peer rows or phone wrapping | `styles/layout.css` | Layout CSS and saved visibility |

Each feature folder has a public `index.ts` and README with function/file
responsibilities and editing recipes. Existing `MechanicalControls.tsx`,
`controlGeometry.ts` and CSS entry files keep their stable import paths.
`GameUI.tsx` explicitly imports `modes/sandbox/index`, preventing an old copied
`SandBox.tsx` from shadowing the folder on Windows.

## Validation

- 281 frontend tests passed, including multi-device release, capability downgrade,
  hide/unmount cleanup, climate preference migration, vertical indicators and
  public feature imports.
- ESLint and the production TypeScript/Vite build passed. Vite still reports its
  existing large main-chunk warning (about 2.17 MB before gzip).
- Chromium checks passed at 1440 × 900 and 390 × 844: lever hit testing, held
  flash, pedal release while hovered/focused, silver/black contrast in seven
  themes, optional appearances, centered hazards, climate sizes and viewport fit.
  No browser JavaScript errors were observed.
- The updater has 14 transaction/backup/undo/refusal tests, plus verification on
  a fresh base checkout and on an earlier copy-applied update.

The browser uses labeled sample telemetry; these checks do not measure gameplay
FPS or physical-phone behavior. This iteration uses the existing cockpit v6
protocol. The cumulative package contains the earlier Rust/Python organization
changes; their prior validation was 101 Rust and 4 Python tests. No new cable
wear/failure or cabin thermodynamics model is introduced by this UI work.
