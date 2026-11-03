# Shared menu actions and personal Hero portraits

## Menu action owner

`frontend/src/components/controller/ControllerAction.tsx` renders a native button with the shared Xbox glyph. `controller.css` is the single owner of its spacing, semantic A/B glyphs, transparent face, theme-colored hover glow, disabled state and focus ring. Back/Continue never underline. Keyboard/controller focus remains visible around the glyph. Menus retain their existing event routing and callbacks.

Migrated surfaces: Play/hero selection, Hero customization, queue, shared Settings/Debugger/Career/Missions tabbed menus, social, world-list Continue, legacy Sandbox/Recon setup, Recon workspace, vehicle picker, exit confirmation, loading Continue, cockpit Close and editor exits. MenuShortcuts remains a non-clickable hint component; the performance recorder's A hint is not a Back/Continue menu action and is unchanged.

## Portrait selection and capacity

HeroRoster is shared by Play and Heroes. Pointer hover and navigation focus no longer choose a vehicle or change its preview. Click/tap or controller A selects it. Only the selected portrait grows and glows; navigation focus uses a thin accessible outline instead. Role filtering and LB/RB browsing do not change the chosen Hero. Heroes still opens styling on selection, and Hold X still explicitly sets the main Hero independently of styling.

For managed Quickplay/Competitive, unavailable roles show black silhouettes with ROLE FULL and are disabled. `heroAvailability.ts` mirrors Rust `policy::role_fits`: at most one Tank, three DPS and two Support, while reserving enough seats for at least one Tank, two DPS and one Support. The valid full teams remain 1/3/1 or 1/2/2. Your old pick is excluded when checking a replacement, reconnect reservations count, and other teams/worlds do not. Sandbox/editor and role-limit-disabled flex testing remain unrestricted. The server continues to validate every request if another player fills a slot during selection.

## Personal and teammate styles

Own roster portraits read the account-scoped per-vehicle loadout or active styling draft. Squad portraits receive each peer's equipped appearance from the server; missing peer data uses factory rather than borrowing the local player's paint. Live and reconnecting roster entries now include world_id and the selected vehicle's appearance. Credentials, inventory and unrelated saved loadouts are not exposed.

Customized portraits are rendered from the installed model through the same named-material paint/finish functions as the garage. Requests debounce rapid edits, run one at a time, deduplicate by model/style, and retain a bounded 48-image cache. Cards display images rather than separate persistent canvases or frame loops. Factory portraits keep their existing static WebP assets. No whole-image color filter recolors windows, tires or trim.

If WebGL or the model is unavailable, a labelled factory-image fallback and saved-paint swatch remain visible. Cached async results cannot overwrite a newer style/account. Body/finish support follows the existing garage material mappings. Seat colors, stitching, stripes, calipers and Tank paint remain pending asset mapping; this patch does not pretend those options are rendered or rename GLBs.

## Installation and checks

Rebuild/restart both frontend and Rust, because the public roster gains equipped appearance data. New frontend code tolerates old servers but cannot show their pre-spawn peer cosmetics until the server is updated.

59 frontend checks cover shared menus, mouse/keyboard/controller actions, click-only preview, main-Hero hold, role capacity, reconnects, account isolation and portrait job ownership. All 150 backend tests pass, including live/reconnecting equipped-appearance publication and factory fallback. TypeScript, changed-source ESLint, direct Vite build and browser checks pass. Browser portrait rendering uses diagnostic GLTF geometry; final original-asset colors and mobile/controller ergonomics need user visual feedback. Full asset prechecks require the original Git LFS files.
