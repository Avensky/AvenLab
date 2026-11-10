# Garage characters

Heroes and Garage use the portrait at the right of the header to open Character.
The editor previews changes on the same turntable as the vehicle. New profiles
confirm a character model before editing. Identity saves Male, Female, or
Nonbinary independently of that model. The server saves identity, appearance,
and prop edits automatically. Earlier profiles with a
character keep their saved gender and use default appearance values as needed.
You can preview emotes before confirming a gender. After setup, the Emotes
tab can compare both rigs without changing the equipped driver.

Vesper's desktop garage uses the full `villager-female.glb`. The compact
garage and portrait share the same geometry with smaller textures. The
selected car loads over a simple stage first. Once the car is on screen, the
garage shell and driver can load. A sigil marks pending assets and becomes
still with Reduced Motion. If the character file is missing or unreadable,
the portrait uses a neutral tile. Download the Git LFS object and restart Vite
after restoring the file.

At widths up to 960 CSS pixels the preview targets 30 fps, draws native
emissive lighting, and updates a 256 px floor mirror at up to 15 Hz. Desktop
previews retain bloom and a larger mirror. Hero cards use factory art or a
ready personalized image, and the Garage Portrait tab prepares custom art.

Source files under `frontend/src/public/models/characters/villager/` may use
either the `village-` or `villager-` prefix. `npm run dev` and `npm run build`
copy Vesper's original into Vite's public directory as needed and prepare the
smaller portrait textures and Rook's garage LOD. Older flat paths under
`frontend/public` are also accepted.
Vesper's bonnet is part of her rig and stays equipped for both hairstyles.
Rook's imported model uses its short hair and coat meshes with the editor's
hair, skin, and clothing color choices.

Garage and the Sandbox hero picker play Garage Life (001–010), the first
batch from the emote catalog. Gestures blend back into relaxed breathing with
alternating hand placements, and a tap
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
heart, a finale bow, and the bonus Hands up crowd emote. Take the stage and Singalong invitation are
choreographed as empty-handed audience gestures. Stoic (131–140) includes a
deliberate nod, a salute, and an exhale with a brief eye closure.
Explorer (141–150) adds a folding map, binoculars, compass, and a collectible.
Jacket reset adapts the backpack gesture to the current outfits.
Tech (151–160) includes gamepad, phone, headset, tablet, and handheld keyboard
gestures. Workshop (161–170) rehearses inspections and maintenance from the
standing mark, with a cloth and tire gauge. Starter (171–180) includes the walk
to the mark, lane checks, countdown, flag drop and flag wave. Starter Comedy
(181–190) includes recoveries for flag mishaps. Race Reactions (191–198) adds
photo finishes, track signals, and finish-line reactions. The pole follows the
closed grip and separates from it during Slipped flag. Props load on demand
in the Character preview and the bag filters out gestures that require both
hands. These packs play on selection in Character → Emotes and return to the
breathing idle.

Garage puts the recommended standing emotes first. Best collects the strongest
gestures from across the packs. Equip Empty hands and open Character → Emotes →
Inside car · AE86 to load the cockpit test from any selected vehicle. Window
wave and Driver thumbs-up keep the left hand on the steering wheel while the
car rolls. Steering test · Left and Right (199–200) keep both hands on the rim
while turning the wheel in place. The library now contains 200 numbered emotes.
Use the Whole car camera for a wide shot throughout a take. The driver stays
seated between clips. Exit car returns to the selected vehicle's standing preview.

Character → Face opens a close-up for iris color, eyebrow tint, and glasses.
The iris palette includes Obsidian black and five other deep shades, with
reduced iris and cornea reflections for the darkest colors.
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
