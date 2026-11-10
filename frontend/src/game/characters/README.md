# Garage characters

Heroes and Garage use the portrait at the right of the header to open Character.
The editor previews changes on the same turntable as the vehicle. Equip saves
the character and its appearance on the signed-in player profile. Earlier
profiles with only a character and outfit still load with their default look.

The two starter drivers have built-in stylized meshes. To use the modular
Village Lady export for Mara, place your licensed `villager-female.glb` in
`frontend/src/game/characters/local-assets/` and restart Vite or rebuild.
That directory is ignored by Git. Build from a checkout without the file to
use the built-in look. The local model uses the exported rig and mesh slots
for the hair, bonnet, outfit, and skin. Jules has original built-in geometry.

Character choices and palettes shared by the game client and server are in
`avenlab-server/src/assets/characters.json` and `character-appearance.json`.
The garage renderer consumes those choices, while the profile endpoint
validates and persists them.
