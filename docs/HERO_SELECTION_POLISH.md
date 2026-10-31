# Hero selection layout polish

A frontend follow-up to the hero portraits/chat update. It preserves the existing
vehicle artwork, server rules, chat transport and cockpit controls.

## Layout

The mode row is flush with the header. The existing teammate-card artwork moves
to a narrower row directly beneath it. On mobile the row starts at the left edge;
at 1,200 px and wider landscape it centers. The selected hero name and role sit
below that row at the upper left. Sandbox/editor omit the multiplayer seats and
place the title directly under the mode row.

Top-right quick picks remove the name band without resizing the portrait art.
The enclosing border/background is removed, including on mobile. Buttons keep
accessible names and hover tooltips. A portrait selects directly and the large
left-hand title confirms its identity. Team cards retain names and full tooltips.

Role filters now have square, adjoining borders, without folder cutouts or gaps.
The bottom vehicle selection strip regains previous/next arrows and a translucent
background. Sandbox/editor environment strips use exactly the same background,
arrows and title sizing. Both strips meet the preserved footer with no rules band.

## Shared selection behavior

`HeroSelection.cycleHero` filters the current hero catalog and delegates to the
same `choose` action as the portrait buttons. It cycles hero IDs, preserving the
Mechanic/Logistics support roles even though they reuse BRZ/AE86 chassis. If the
selected hero lies outside the active filter, the first forward/back action picks
the first/last visible hero. Wraparound stays within that role filter.

Admitted picks still await the server. Busy arrows are disabled, and a denied
choice retains the locked hero and shows the actual error. Environment changes
remain disabled for an admitted world.

The existing reusable VehicleSelector, MapSelector and SelectorArrow own the bar
artwork. Form selectors expose a small navigation marker to useFormNavigation:
left/right invokes that strip's previous/next action and retains focus. Up/down
moves to another form control. Portrait directions still move focus without
selecting a new hero. Legacy setup menus retain their existing menu-index routing.

## Chat interaction

Chat has no enclosing border and begins at 35% opacity with a clear background.
A pointer press, focus or key interaction restores full opacity for four seconds;
subsequent activity resets the single timer. It fades even if a native field still
has focus but receives no further interaction. Mouse hover and an open assisted
keyboard keep it solid. The touch path avoids a permanently sticky hover state.

Typing and sending preserve existing keyboard isolation, confirmed server names,
team audience, draft errors and acknowledgment deduplication. Incoming messages do
not wake the panel. Its timer is cleared on unmount. There is no extra polling,
requestAnimationFrame loop, WebSocket, physics work or server persistence.

## Install and scope

Rebuild the frontend after applying this cumulative update. If the previous
hero portraits/chat update was already installed, Rust is unchanged. Older
installations also need the included Rust source rebuilt for chat and alpha
admission. The update installer preserves backups and supports exact undo.

Validation is recorded in the package's validation.json. Browser checks cover
emulated desktop, landscape and portrait viewports, real disposable local chat,
controller polling and the actual garage scene. These checks do not certify a
physical phone GPU or controller. The five existing WebP images remain unchanged
at 39,788 bytes total. The existing main JavaScript bundle warning remains.
