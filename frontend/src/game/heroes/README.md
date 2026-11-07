# Personal hero collection

Heroes and Play share SelectionHeader/SelectionFooter, app theme tokens and Xbox Back/A/LB/RB hints. Heroes uses the same HeroRoster component and portrait assets as game selection. Settings stay closed until Click/A selects a portrait. Hover and navigation focus never choose a vehicle or change its preview. LB/RB moves focus through the filtered roster and closes settings; Click/A chooses the preview. B closes settings before leaving Heroes.

Only a complete 1,200 ms hold of Xbox X, keyboard X, or the on-screen X button chooses the profile default hero. A circular arc and rotating halo track progress; the confirmed main keeps its glow and X MAIN portrait badge. Early release, pointer cancellation, focus loss, disconnect, navigation, or a vehicle change cancels an incomplete hold. Settings must be open before a hold can start. Editing a style never chooses a different main. The existing controller polling loop owns gamepad input; no second poller is installed. Reduced motion and high contrast keep progress readable without the moving halo.

Appearance changes preview immediately and enter HeroSaveQueue. The queue coalesces rapid edits per vehicle, serializes requests and preserves the latest main choice. Back drains it before leaving. Failed requests retain the edit and show NOT SAVED / Retry. Pending asset work remains visibly labelled rather than presented as complete.

hero_loadout_save always edits the authenticated server actor. The server checks hero policy, body color, appearance enums and skin ownership. Client-supplied profile/player target fields cannot edit another player. Profiles persist vehicle-keyed loadouts; live snapshots carry the equipped appearance to other players. Support heroes currently share their chassis appearance.

useHeroLoadouts is an in-memory cache scoped to the current profile; adopting another profile or signing out clears foreign drafts. It no longer reads the old device-wide persisted hero cache. VehiclePreviewModel consumes the current profile's per-car draft/loadout or FACTORY_APPEARANCE, never legacy Garage paint, global bundle, or interface theme. Paint, finish and metallic strength preview immediately; choosing Current Theme Color in Heroes saves a resolved color for that car only.

The skin picker lists Factory and server-reported owned skins. Equips are saved per car; rare bundles remain locked placeholders until inventory/artwork is ready. Body presets are free alpha paint editing, not rare-item unlocks. Base readable UI themes remain independent of cosmetic ownership.

Live AE86/BRZ/Camaro/Supra body materials use authoritative snapshot colors and instance-owned clones. Seat color requests are saved but not rendered: named BRZ front-seat nodes in this export have no mesh/children. Vehicle Editor → Materials lists the per-car seat, stitching, caliper, stripe and steering-wheel mappings requiring artwork and user visual feedback. No GLBs are renamed here.

The portrait picker and styling sidebar now form separate stages. Selecting a portrait or confirming A opens styling and hides the roster. Back returns to the roster. The styling panel fills the space between the shared header/footer without a gutter; Hold X keeps its orbit/glow without a rectangular button frame. See docs/HERO-FLOW-AND-TURRET-ORBIT.md.

The X footer action now uses ControllerAction + ProgressOrbit at the same A/B glyph size; the footer stays 32 px before/during/after holding. The selected portrait diamond is removed, X MAIN has no rectangular plate, and styling children do not shrink away native mobile overflow. See docs/TANK-RESPONSE-SCOPE-AND-ACTION-UI.md.
