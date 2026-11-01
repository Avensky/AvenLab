# Vehicle appearance slots and loadouts

Main menu → Heroes owns paint, finish and default-hero selection. Server profiles persist validated vehicle-keyed loadouts; snapshots carry equipped appearance to every player. The local store caches saved choices and keeps an unsaved draft for garage previews. Existing Settings paint fields are retained only for legacy unsaved previews.

| Slot | Current behavior | Asset work remaining |
| --- | --- | --- |
| Body | Saved and replicated AE86 Primary, BRZ body, Camaro ext.001 atlas tint, Supra PaintTNR | Tank atlas isolation |
| Camaro stripes | Reserved individual item | Aligned exterior stripe mask/decal |
| FR-S seats | Saved color request, not applied | Verify actual seat fabric material; named seat nodes are empty |
| Stitching | Reserved item and color concept | Dedicated thread material/mask |
| Steering | HUD accent follows equipped body when matching is on | Physical GLB wheel material mapping |
| Calipers | Materials checklist | Verified per-car paint slot |

HeroAppearance on the Rust server validates color format, finish/seat enum values and skin ownership before persistence. hero_loadout_save cannot award inventory, credits or rare skins. Generic alpha body colors are currently editable; future paid item equips need a server entitlement mapping per slot. The preview-only item/bundle catalog reserves those IDs without granting them. Base UI palettes remain free.

Live material application waits for the first ready R3F frame, clones only known body materials on that instance, and then runs only when the appearance changes. Cleanup restores original assignments and disposes the owned clones. Cached GLBs and other players' material instances are never edited.

FR-S reference uses BRZ body roughness 0.20529644 and clearcoat roughness 0.04; Soft broadens reflections. This is material reflection control, not a sparkle particle emitter. Geometry, environment and lighting still influence individual highlights.

See game/heroes/README.md for the save/default/preview flow. Vehicle Editor → Materials owns the unresolved per-car checklist. Do not guess generic Color_* or red1 mappings or mass-rename the GLBs.
