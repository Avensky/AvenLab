# Hero flow, turret orbit and combat keybindings

Choose a Hero portrait before opening styling, using the same portrait roster, header and footer as Play selection. Back returns from styling to the roster before leaving. The styling sidebar meets the header, footer and right edge without gutters. Styling autosaves per player and vehicle; selecting a portrait does not change the main Hero. Hold X for 1.2 seconds to set the main Hero. Its circular progress/glow remains, without a surrounding rectangular button frame.

Buttons use theme highlights and focus feedback instead of underlined hover text, including Back and Continue.

## Keyboard and controller

| Default | Action |
| --- | --- |
| F, held | Fire selected weapon |
| V | Next weapon |
| G | Previous weapon |
| Y on controller | Cycle weapons |
| RB on controller | Fire |
| Right stick / on-screen aim joystick | Aim turret |
| R3 / hull lock button | Toggle hull orientation lock |
| Left Shift / LB / Ram button | Ram |

Fire, next weapon and previous weapon are editable in Settings > Keyboard. Existing saved driving bindings are preserved. If a new combat default conflicts with an old driving assignment, migration assigns a free valid combat key. Fire releases on key-up, focus loss and menu opening; keyboard, touch and controller fire remain independently owned. Combat keybinds do not fire while typing or navigating menus. V retains its diagnostic shortcut when combat is disabled, and selects weapons while combat is enabled.

Mouse/trackpad motion no longer aims the turret. The existing camera drag gesture remains available; turret aiming uses the on-screen joystick or controller right stick.

## Tank and cockpit HUD

Tank turret controls start enabled on entry, including a fresh spawn of the same tank after stopping a test. An explicit stop remains respected when simply opening or closing an overlay.

The right-side turret joystick has separate circular Fire, Cannon, Coax MG and Hull Lock controls around it. Controls remain outside its radius, with clock hands/rings driven by server cooldowns and dimmed cooling weapons. Weapon choices move into this orbit when touch controls are visible; the bottom selector remains available when the orbit is hidden. Ram stays at bottom center. The shifter remains above the aim area.

The cockpit's Lights, Wipers and Cruise child tabs occupy one full-width row directly below the parent tabs. The existing steering wheel and three lever visuals return as navigation, alongside the existing functional panels. Turret status stays in the Climate HUD.

## Validation and feedback

77 targeted frontend tests, TypeScript, touched-source ESLint and direct Vite production build pass. Browser checks cover Hero flow, keybind editing, restored cockpit navigation and joystick clearance across mobile and desktop sizes. This patch changes no backend payload; prior server validation is recorded separately in validation.json rather than claimed as rerun.

Please check controller/mobile reach on actual hardware. Locked skin bundles and missing model material mappings retain their pending labels. Projectile flight, blast and dedicated Ram/Coax presentation remain pending from the preceding patch; this update does not add them.
