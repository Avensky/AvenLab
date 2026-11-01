# Personal hero collection

Heroes and Play share SelectionHeader/SelectionFooter, app theme tokens and Xbox Back/A/LB/RB hints. Hero portrait assets come from the same HeroPortrait component as game selection. Focus/hover and LB/RB preview a vehicle. Click/A or Set As Main chooses the profile's default hero. Editing a style never chooses a different main.

Appearance changes preview immediately and enter HeroSaveQueue. The queue coalesces rapid edits per vehicle, serializes requests and preserves the latest main choice. Back drains it before leaving. Failed requests retain the edit and show NOT SAVED / Retry. Pending asset work remains visibly labelled rather than presented as complete.

hero_loadout_save always edits the authenticated server actor. The server checks hero policy, body color, appearance enums and skin ownership. Client-supplied profile/player target fields cannot edit another player. Profiles persist vehicle-keyed loadouts; live snapshots carry the equipped appearance to other players. Support heroes currently share their chassis appearance.

useHeroLoadouts is an in-memory cache scoped to the current profile; adopting another profile or signing out clears foreign drafts. It no longer reads the old device-wide persisted hero cache. VehiclePreviewModel consumes the current profile's per-car loadout or FACTORY_APPEARANCE, never legacy Garage paint, global bundle, or interface theme. Choosing Current Theme Color in Heroes saves a resolved color for that car only.

The skin picker lists Factory and server-reported owned skins. Equips are saved per car; rare bundles remain locked placeholders until inventory/artwork is ready. Body presets are free alpha paint editing, not rare-item unlocks. Base readable UI themes remain independent of cosmetic ownership.

Live AE86/BRZ/Camaro/Supra body materials use authoritative snapshot colors and instance-owned clones. Seat color requests are saved but not rendered: named BRZ front-seat nodes in this export have no mesh/children. Vehicle Editor → Materials lists the per-car seat, stitching, caliper, stripe and steering-wheel mappings requiring artwork and user visual feedback. No GLBs are renamed here.
