# Alpha selection and queues

HeroSelection owns role-tab presentation and one pending UI command; Server owns
seats, roles and locked picks. sessionActions owns the existing socket's spawn
acknowledgement and garage-to-driving handoff. useAlphaFlow reacts to admission
while queued. QueueScreen displays the server's ticket and uses the shared video
background. ProgressBadge and Career read server progression; they never award it.
EditorTestAction explicitly exports/applies a draft to the dedicated editor slot.

VehicleMenu lazily reuses HeroSelection in managed games; Back closes the picker
without cancelling the occupied seat. Main selection Back cancels its session.
See docs/ALPHA_UI_AND_LOBBIES.md for scope and alpha balancing values.

Play enters this garage with only Quickplay and Competitive tabs. The two portrait
cards select 3v3 or 5v5 independently; the combined `mode` and `team_size` travel in
one server-validated `mode_join`. Activating a size selects and requests admission
in one action; focusing or hovering alone never joins. Profile recovery, pending
request guards and server-confirmed Hero/Queue routing remain shared with Continue.
`teamSize` retains the format while changing category; authoritative admission and
queue views restore it after reconnect/promotion. Role limits, teammate slots,
results and Play Again use the server's confirmed size. Legacy `skirmish` records
remain readable and requeue as Quickplay 3v3 rather than adding a duplicate tab.

The compact main menu's Explore entry opens the other four destinations:
Sandbox, World Editor, Signal Recon and the planned Swarm Command. They share the
garage/configuration component but cannot become extra Play match tabs. Returning
to Play restores the last Quickplay/Competitive category and selected size.
Signal Recon opens existing interface setup; sessionActions rejects research/planned
mode_join calls.
The restored VehicleSelector/MapSelector use native SelectorArrow buttons under
form navigation, retaining legacy setup-row behavior elsewhere. Vehicle arrows
use the same server-validated hero chooser as the wall. Map arrows lock once a
world is admitted. Headers, mode/roster rows and the bottom workbench use the full
safe viewport width; the main menu has brand/progress left and actions right.

HeroRoster never previews on hover or focus. Click/A selects; only aria-pressed cards grow/glow. heroAvailability.ts mirrors Rust role_fits with the local prior pick excluded, live/reconnecting teammates included, and world/team scope respected. Full-role portraits are disabled black silhouettes; testing/flex modes skip limits. Rust remains authoritative for racing selections.

HeroPortrait uses account-scoped saved styles (or the open garage draft) for the local roster, and explicit equipped appearances for peer squad cards. heroPortraitCache serializes/debounces custom image generation, deduplicates appearance keys and bounds the cache. It reuses showroom body/finish mapping via bakeHeroPortrait; factory cards remain static WebPs. Missing WebGL/assets show a labelled fallback, never a fake whole-image color tint. Pending seats/stripes match the showroom limitations.
