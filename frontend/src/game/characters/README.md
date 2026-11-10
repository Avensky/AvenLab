# Garage characters

Heroes and Garage use the portrait at the right of the header to open Character.
The editor previews changes on the same turntable as the vehicle. New profiles
confirm their character gender before editing. The server preserves that choice
and saves appearance and prop edits automatically. Earlier profiles with a
character keep their saved gender and use default appearance values as needed.
You can preview emotes before confirming a gender. After setup, the Emotes
tab can compare both rigs without changing the equipped driver.

Vesper's garage and portrait share the full-detail `villager-female.glb` from
`frontend/public/models/characters/villagers/villager-female/`. While it loads,
the garage plays the rain effect and the portrait shows a loading tile. If the
file is missing or unreadable, the garage leaves the turntable clear and the
portrait shows a neutral tile. Download the Git LFS object and restart Vite
after restoring the file.

Source files under `frontend/src/public/models/characters/villager/` may use
either the `village-` or `villager-` prefix. `npm run dev` and `npm run build`
copy Vesper's original into Vite's public directory and prepare Rook's garage
and portrait LODs. Older flat paths under `frontend/public` are also accepted.
Vesper's bonnet is part of her rig and stays equipped for both hairstyles.
Rook's imported model uses its short hair and coat meshes with the editor's
hair, skin, and clothing color choices.

Garage and the Sandbox hero picker play Garage Life (001–010), the first
batch from the emote catalog. The driver breathes between gestures and a tap
queues the friendly wave. The same clips are retargeted to Vesper's imported
rig and the built-in drivers. Reduced Motion pauses character animation.
Vesper also has procedural blink, smile, and brow shapes in the live preview.
The rain and sparks seen during loading use one GPU point batch.
Victory Essentials (011–020) is available under Emotes → Victory. On a live
win, the Awards tab can play Small fist pump with the equipped driver.

The Props tab loads the black-and-gold bag from
`frontend/public/models/characters/props/bag-black-gold/`. The mobile GLB is
preferred, with the garage GLB and the legacy `shop-bag.glb` as fallbacks.
The supplied `Grip_Handle` locates the bag in the driver's hand. The app uses
a built-in bag when no textured GLB is installed. The Emotes tab previews
the compatible gestures for the equipped prop. Full body, Face, and Hands
camera presets support zoom from 80% to 125%. Heroes, Garage and the
pre-match hero picker share vehicle zoom from 100% to 160%.

Character choices and palettes shared by the game client and server are in
`avenlab-server/src/assets/characters.json` and `character-appearance.json`.
The garage renderer consumes those choices, while the profile endpoint
validates and persists them.
