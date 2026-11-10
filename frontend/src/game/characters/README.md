# Garage characters

Heroes and Garage use the portrait at the right of the header to open Character.
The editor previews changes on the same turntable as the vehicle. New profiles
confirm their character gender before editing. The server preserves that choice
and saves appearance and prop edits automatically. Earlier profiles with a
character keep their saved gender and use default appearance values as needed.

The two starter drivers have built-in fallback meshes. Put the source models
`village-female.glb` and `village-male.glb` in
`frontend/src/public/models/characters/villager/`. `npm run dev` and
`npm run build` generate separate garage and portrait GLBs under
`frontend/public/models/characters/villager/` for Vite to serve. The
`villager-` spelling and older flat paths under `frontend/public` are also
accepted. Download the Git LFS objects when a source file is a pointer.
The generated LODs are ignored by Git. Vesper's bonnet is part of her rig, so it
stays equipped for both hairstyles. The portrait is rendered from the same
look as the garage model. Rook's imported model uses its short hair and coat
meshes with the editor's hair, skin, and clothing color choices.

Garage and the Sandbox hero picker play Garage Life (001–010), the first
batch from the emote catalog. The driver breathes between gestures and a tap
queues the friendly wave. The same clips are retargeted to Vesper's imported
rig and the built-in drivers. Reduced Motion pauses character animation.
Vesper also has procedural blink, smile, and brow shapes in the live preview.
The rain and sparks seen during loading use one GPU point batch.

The Props tab includes the shop bag. An optional textured `shop-bag.glb` can be
installed under `frontend/public/models/characters/` before restarting Vite.
The app uses a built-in bag when that file is absent. The Emotes tab previews
the compatible gestures for the equipped prop. Full body, Face, and Hands
camera presets support zoom from 80% to 125%.

Character choices and palettes shared by the game client and server are in
`avenlab-server/src/assets/characters.json` and `character-appearance.json`.
The garage renderer consumes those choices, while the profile endpoint
validates and persists them.
