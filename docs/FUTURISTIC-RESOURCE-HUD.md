# Optional futuristic instruments and teammate portraits

Settings → HUD → Instrument layout cycles CLASSIC, FUTURISTIC, BOTH and HIDDEN.
The individual CLASSIC THREE GAUGES and FUTURISTIC RESOURCE HUD switches remain
independent. Installing preserves saved gauge visibility; the new futuristic
option starts hidden until selected. Shifter, steering, pedals, assists, radio,
climate and teammate portraits keep their own switches and input mappings.

The bottom-center resource panel uses confirmed combat HP, calibrated fuel,
nitrous, mechanical condition, engine temperature, RPM, speed, gear and ultimate
charge. Combat HP is never inferred from mechanical condition. Speed respects
MPH/KM/H; confirmed automatic Park displays P. Unknown or stale values show a
dash. Ultimate is a charge readout, not a newly implemented ultimate action.
Weapon heat is not replicated by the current server and is not invented here.

The resource panel, active effects and non-touch weapon selector share a single
vertical layout owner. Actual steering, transmission/aim, ignition and pedal
bounds reserve side space; narrow layouts lift the center group above the
physical controls. Touch aim/fire remains on its existing control deck. The
classic HP card is replaced while futuristic instruments are enabled; defeat,
safe-spawn countdown and confirmed damage flash remain active. The existing
health visibility/team policy also applies to the new local and teammate HP bars.

Up to four teammates appear at top left using the existing vehicle hero portraits
and replicated appearances. Membership/names come from the scoreboard resolver;
unknown identities are labelled rather than guessed. Only the local team/world
appears. Disconnection, world/team changes and stale snapshots clear old entries.
Roster sampling is 4 Hz; vehicle instruments reuse the existing 20 Hz sampler.
Portrait/layout hiding does not change physics, team ownership or resource use.

Cockpit → Radio → SINGLE ROW uses compact playback, power, next-track, volume,
missions and minimize controls. Click the track name to choose audio files. Full
previous/restart/source controls stay on the Cockpit radio page. MINIMIZED and
WITH DIALS remain available. Compact climate fits the clock, hazards, ambient
reading, bearing glyph, performance readouts and minimize control on one row;
full HVAC retains the knobs. The bearing glyph tooltip exposes the full bearing.
Frames/accent colors follow the app theme; health, fuel and nitrous colors keep
stable meanings. No extra textures, rendering loop or gameplay channels added.

## Validation and remaining device review

Automated coverage exercises resource availability, independent classic/futuristic
visibility, health policies, defeat feedback and teammate/world filtering. The
production frontend bundle and TypeScript checks are run separately from the
asset prebuild: this checkout contains Git LFS pointers for the road GLBs.

Physical mobile touch sizing, both-display clearance with all optional controls,
and portrait/landscape appearance still need in-game review. Browser visual
inspection could not access the local preview in this environment.

## Portrait, status strip and right-side consoles

Ultimate charge traces the beveled square around the transparent portrait. The two paths travel in opposite directions and the percentage stays in the lower-right corner. A full server reading lights the frame. Buffs sit at the left end of the console lip and debuffs sit at the right. Tap a badge for its existing timer and description.

The radio, climate panel, ability bank and pedals share a width and right edge. On short screens the map can sit beside the console bank. The dashboard Missions tab shows the objective and most recent bulletin. Press **L** or tap the objective to open the mission log with full details and history. **K** is the default headlight key and can be changed in Keyboard settings.
