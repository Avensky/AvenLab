# Garage characters

Heroes and Garage use the portrait at the right of the header to open Character.
The editor previews changes on the same turntable as the vehicle. Equip saves
the character and its appearance on the signed-in player profile. Earlier
profiles with only a character and outfit still load with their default look.

The two starter drivers have built-in stylized meshes. To use the modular
Village Lady export for Vesper, place your licensed `villager-female.glb` in
`frontend/public/models/characters/` and restart the frontend with
`npm run dev` or build it with `npm run build`. These commands generate a
lower-detail garage GLB and a separate portrait GLB beside the source. The
source and both LODs are ignored by Git. Builds without the source use the
built-in look. The model uses the exported rig and mesh slots for the hair,
bonnet, outfit, and skin. Rook has original
built-in geometry. Vesper's bonnet is part of the rig's finished head, so it
stays equipped for both hairstyles. The portrait is rendered from the same
look as the garage model. In the garage, tap Vesper to wave.

Character choices and palettes shared by the game client and server are in
`avenlab-server/src/assets/characters.json` and `character-appearance.json`.
The garage renderer consumes those choices, while the profile endpoint
validates and persists them.
