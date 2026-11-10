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
batch from the emote catalog. Gestures blend back into relaxed breathing and a tap
queues the friendly wave. The same clips are retargeted to Vesper's imported
rig and the built-in drivers. Reduced Motion pauses character animation.
Vesper also has procedural blink, smile, and brow shapes in the live preview.
The rain and sparks seen during loading use one GPU point batch.
Victory Essentials (011–020) is available under Emotes → Victory. On a live
win, the Awards tab can play Small fist pump with the equipped driver.
Cute and Playful (021–030) is available under Emotes → Playful. The imported
rigs articulate individual fingers for the heart trace and the counting gag.
The Playful group also has Robot dance, with deliberate freezes and chest pops.
Shy and Sweet (031–040) is available under Emotes → Shy. Casual walk takes short
steps and turns on planted feet to return to the turntable mark. Victory also has Rap hands, three heart
silhouettes, and a Finger guns gesture.
Quiet thank you leads the Shy list and the empty-handed garage idle rotation.
The Shy preview group also includes Oh, no.
Tsundere (041–050) is available under Emotes → Tsundere. Four of its gestures
can be previewed while holding the bag. Sideways check glances over during a walk.
Expressions (051–060) includes Fingertip plea, a two-handed gesture with
watery eyes. Select the Hands camera to see the touch or Face for the expression.
Roadside has spotter gestures and an upright tire check. Rivalry includes a
starting countdown, a photo pose, and a post-race nod. Pit Crew has radio
checks, pit signals, and a crew fist bump.
After Hours (091–100) adds small reactions, a shaka, and a lateral step-together shuffle.
Six are available with the shop bag.
Showroom (103–112) adds a car reveal, a mimed key toss, and eight other
gestures. Six are available with the shop bag.
Elegant (113–120) includes a curtsy, gentle applause, and a formal farewell.
Performer (121–130) includes a four-count side step, a full turn, an overhead
heart, and a finale bow. Take the stage and Singalong invitation are
choreographed as empty-handed audience gestures. Stoic (131–140) includes a
deliberate nod, a salute, and an exhale with a brief eye closure.
Explorer (141–150) adds a folding map, binoculars, compass, and a collectible.
Jacket reset adapts the backpack gesture to the current outfits.
Tech starts with two gamepad gestures (151–152). The props are loaded on demand
in the Character preview and the bag filters out gestures that require both
hands. These packs play on selection in Character → Emotes and return to the
breathing idle.

Garage puts the recommended standing emotes first. Best collects the strongest
gestures from across the packs. Choose the AE86 in Heroes, equip Empty hands,
then open Character → Emotes → Inside car for the driving set. Window wave and
Driver thumbs-up keep the left hand on the steering wheel while the car rolls.
Use the Whole car camera for a wide shot throughout a take. The driver stays
seated between clips. Exit car returns to the standing preview.

Character → Face opens a close-up for iris color, eyebrow tint, and glasses.
The iris palette includes Obsidian black and five other deep shades.
Both villagers use these settings in the live model and their rendered portrait.

Rook's coat outfits can preview Folded arms by the door under Garage emotes.
The pose requires a fitted road-car side panel, closed doors, and empty hands.
Heroes cycles shorter gestures with a breathing idle between them.

## Planned vehicle interactions

- Reach for the driver and passenger handles, then open or close each door using
  the vehicle's authored hinge.
- Open the driver door, step into the cabin, settle into the seat, and pull the
  door closed from inside. Reverse the sequence to exit and close the door.
- Lift and lower the hood and trunk from their handles. Fit each interaction to
  the vehicle's part, hinge, and handle anchors.
- Turn the steering wheel left and right with both hands tracking the rim.
- Pull and release the e-brake with the left or right hand to match the cabin,
  with the other hand steering.
- Rest or extend an arm through the left or right open window, using the window
  ledge and seat position as anchors.

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
