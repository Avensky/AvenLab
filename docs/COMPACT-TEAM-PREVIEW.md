# Compact pre-match team preview

The hero picker keeps Team, Stats, Red/Blue team selection and minimize controls in one toolbar inside the preview frame. Both views use the same fixed content viewport, so switching views leaves the hero picker and footer at the same height. The previous repeated preview height/card overrides have been consolidated into one CSS section.

Expanded content is 68px on desktop, 60px on phones and 48px in short landscape layouts, plus the single 26px/24px toolbar and frame spacing. Team portraits scroll horizontally; the Stats table scrolls within the same viewport. Collapse hides the content while leaving the toolbar available. Selecting a view or team expands the same component again. These choices are display-only.

The default team is your server-confirmed team. Red and Blue tabs allow browsing either roster. With focus anywhere in the preview, LB/RB changes Team/Stats and LT/RT changes the preview team; the selected tab, rather than the focused button, owns cycling. Keyboard Q/E and 1/3 are equivalent. A activates the focused preview control. Outside the preview, hero role navigation retains its existing controls.

Opposing heroes remain mystery cards until the server publishes a running/overtime/ended phase and nonempty round ID for the active world. Missing phase metadata, a disconnected client, a mismatched current world or an explicit `hero_hidden` marker keeps the choice hidden. Physics snapshots do not independently grant reveal permission, so stale or wrong-world packets cannot expose a choice.

Mystery rows preserve public player identity but remove hero/model, appearance, role, pick readiness, reconnect status and combat totals. Shared scoreboard projections also honor explicit server privacy markers before considering vehicle IDs or showcase fallbacks. The Rust server supplies the authoritative visibility fields and suppresses pre-start opponent entities/configuration; the frontend mask is an additional ordering/compatibility safeguard.

Player-owned paint remains on allied portraits. Neither team browsing nor view changes select, purchase or deploy a different hero. Updating both Rust and frontend is required for the new authoritative reveal fields; older servers without them remain private.
