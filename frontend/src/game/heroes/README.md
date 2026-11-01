# Heroes / equipped appearance

Main menu → Heroes reuses the garage scene and selection model. Draft paint never changes an active car; Save & Set Default Hero sends hero_loadout_save, waits for server validation/persistence and updates the cached loadout. Play uses the saved default only as a showcase, never as an automatic match pick.

The profile stores default_hero and vehicle-keyed hero_loadouts. Support heroes currently share their chassis loadout (Mechanic=BRZ, Logistics=AE86). Snapshots carry validated appearance for every vehicle. Spawn, model change and editor-world rebuild restore the matching saved loadout. Owned-only skin IDs are checked by the server; rare bundle/emote controls are placeholders, with no purchase or unlock endpoint.

Live body paint operates on instance-owned material clones for AE86, BRZ, Camaro and Supra. Other clients use snapshot colors, not their own device theme. Tank atlas tinting is pending. Save is authoritative; body paint in Heroes is currently free alpha customization and does not grant rare inventory items.

Seat preferences are saved requests until the asset slot is verified. BRZ SEAT_FRONT_LEFT/RIGHT nodes contain no mesh/children in the supplied GLB. Do not recolor generic Color_* or red1 slots by guesswork. Vehicle Editor → Materials records the naming/mapping checklist for seats, stitching, calipers, stripes and the physical steering wheel. Existing material names remain unchanged.

World Change Vehicle uses the existing driving rigs at the interpolated current-player pose; hover/focus changes the local preview and confirmation changes the server car. The camera follows that pose while the menu is open. Cancel restores the server-selected model automatically. The server independently recovers a sustained fall below the map, so opening a menu cannot disable recovery.
