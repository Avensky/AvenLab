# Garage characters

Heroes and Garage use the portrait at the right of the header to open Character.
The editor previews changes on the same turntable as the vehicle. Equip saves
the character and its appearance on the signed-in player profile. Earlier
profiles with only a character and outfit still load with their default look.

The two starter drivers have built-in stylized meshes. To use the modular
Village Lady export for Mara, place your licensed `villager-female.glb` in
`frontend/public/models/characters/` and restart Vite or rebuild.
Vite serves it at `/models/characters/villager-female.glb`. The GLB is ignored
by Git. Builds without it use the built-in look. The model uses the exported rig
and mesh slots for the hair, bonnet, outfit, and skin. Jules has original
built-in geometry.

Character choices and palettes shared by the game client and server are in
`avenlab-server/src/assets/characters.json` and `character-appearance.json`.
The garage renderer consumes those choices, while the profile endpoint
validates and persists them.
