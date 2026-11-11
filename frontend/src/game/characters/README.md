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
garage shell and driver can load. A stationary metallic platform marks pending assets, with complementary theme accents.
Only its light sweep animates, and Reduced Motion freezes that sweep. If the character file is missing or unreadable,
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
in the Character preview. Handheld props are temporarily stowed when a gesture
requires free hands or the pairing has not been reviewed. Pairing notes and
future filter guidance are in `docs/EMOTE_PROP_NOTES.md`. These packs play on selection in Character → Emotes and return to the
breathing idle.

Garage puts the recommended standing emotes first. Best collects the strongest
gestures from across the packs. Enter cockpit uses the selected vehicle, stows
handheld props and fits either driver to its controls. Wheel grips follow the
separately modeled or extracted steering wheel. Window wave and Driver thumbs-up
release the outboard hand. Shift up, Shift down, Clutch and shift, Parking brake,
Honk, Turn ignition key and Signal before pulling out are stationary control previews.
Honk uses the shared vehicle sound bus and respects its volume and mute settings.
The legacy numbered library contains 200 emotes, with seven additional named
cockpit actions. Whole vehicle keeps a wide shot during a take. Exit cockpit
restores the outside pose and equipped prop.

Vesper's skirt uses a seated drape after skinning to settle the fabric below the
wheel. Seated sleeve cuffs taper around the forearms to expose the hands. The shader is prepared with the character and stays compiled when entering
or leaving the cockpit. The runtime split preserves source meshes, materials and
triangle counts and rejects asset revisions that fail their fingerprints.

Garage has a Camera button beside the zoom controls. High Angle, Driver Door,
and Chase stay inside the room envelope. Cockpit uses the driver's eye position,
and Dashboard frames the authored gauges with a localized light and instrument
emission. Camera returns ease over a longer interval. Showroom stays draggable
while seated. The eye icon hides the interface and Back restores it.

The Time Machine fits the full head and hat under the gullwing roof. Its
driver-side gullwing is split along the original mesh seams. Enter cockpit opens
a supported door, seats the driver and closes the door without moving the car.
The Character preview plays the same entry for models with a rigged door.
Vehicle models without an articulated door retain direct seated previews. The AE86's
right-hand driver door uses the panel, interior card, window, seals, and mirror
from the bundled model. Body → Right Door opens the same hinge manually.
Drive Out opens the door, seats the driver, closes the door, and moves into a
short forward roll with a chase camera. The driver remains seated at the
endpoint. Use Steer left or right there, or Reset to return to the turntable.

Character → Face opens a close-up for iris color, eyebrow tint, and glasses.
The iris palette includes Obsidian black and five other deep shades, with
reduced iris and cornea reflections for the darkest colors.
Both villagers use these settings in the live model and their rendered portrait.

Rook's coat outfits can preview Folded arms by the door under Garage emotes.
The pose requires a fitted road-car side panel, closed doors, and empty hands.
Heroes cycles shorter gestures with a breathing idle between them.

## Planned vehicle interactions

- Fit driver and passenger handles and doors on additional cars. Reverse the
  AE86 entry sequence to step out and close the door.
- Lift and lower the hood and trunk from their handles. Fit each interaction to
  the vehicle's part, hinge, and handle anchors.
- Pull and release the e-brake with the left or right hand to match the cabin,
  with the other hand steering.
- Rest or extend an arm through the left or right open window, using the window
  ledge and seat position as anchors.

Appearance → Handheld props loads the black-and-gold bag from
`frontend/public/models/characters/female/props/bag-black-gold/`.
The earlier `characters/props/bag-black-gold/` location remains supported. The mobile GLB is
preferred, with the garage GLB and the legacy `shop-bag.glb` as fallbacks.
The supplied `Grip_Handle` locates the bag in the driver's hand. The app uses
a built-in bag when no textured GLB is installed. The Emotes tab previews
the full gesture library, retaining reviewed prop pairings and stowing the bag for other takes. Full body, Face, and Hands
camera presets support zoom from 80% to 125%. Heroes, Garage and the
pre-match hero picker share vehicle zoom from 100% to 160%.

Character choices and palettes shared by the game client and server are in
`avenlab-server/src/assets/characters.json` and `character-appearance.json`.
The garage renderer consumes those choices, while the profile endpoint
validates and persists them.
# Fitted wardrobe sets

The dressing room supports five Gothic skirt/corset sets on the existing Village
Woman rig. `character-wardrobe.json` is shared with server validation. Saved
choices contain `wardrobe: { set, shirt, waist }`; legacy profiles still use
their original outfit. Gothic-04 requires a shirt, and modesty shorts are always
visible. Identity, bag, face, hair, and color choices stay on the same character.

Each set has a `garage.glb` and `mobile.glb` in
`public/models/characters/wardrobe/`. Both must be installed before the set can be equipped. Portraits and compact garage/victory views use the mobile model. A
missing pack falls back to the original clothed character model.

Garment nodes carry `wardrobeRole` extras. Fitted variants provide tucked and
long hems, with shirts under or over the corset. The `_AVEN_COVERAGE` vertex
attribute stores six bit masks in this order: none/tucked, none/over,
under/tucked, under/over, over/tucked, over/over. Hidden body and inner-garment
triangles are removed from a private index buffer when the selection changes;
the source model stays shared. Disposal restores source geometry. This adds no
per-frame clothing simulation. New imported clothes still need fitting,
weights, and masks; changing draw order alone cannot resolve intersections.

Asset checks (run from `frontend`):

```sh
node scripts/build-wardrobe-lods.mjs /path/to/raw /path/to/output
node scripts/check-wardrobe-assets.mjs /path/to/output
node scripts/sample-wardrobe-emotes.mjs /path/to/raw/gothic-01.glb /path/to/poses.json
node --test tests/wardrobe.test.mjs
```

Keep face/body coordinates unquantized: existing face shaders use bind-space
positions. The asset checker loads compressed GLBs through Three.js and tests
all layer modes, weights, role tags, and coverage flags. It strips textures for
Node loading, so it does not certify browser image decoding or GPU rendering.

## Dressing room

Character tabs are Identity, Appearance, and Emotes. Appearance keeps the live
character in the center, with a scrollable category rail and a two-column item
catalog. It reuses the existing scene; cards are light SVG illustrations, not
additional WebGL previews. Face, hair, skin, and headwear categories focus the
face camera. Leaving restores the earlier camera. Colors contains preset dyes,
paired palettes, and custom fabric/accent pickers.

The 13 categories cover outfits, tops/corsets, skirts/pants, dresses, outerwear,
shoes/socks, headwear, accessories, handheld props, hair, face, skin, and colors.
Accessories contains glasses, bow ties, and harnesses. Gothic corsets and skirts
still equip as fitted matched sets; Tops & corsets controls their shirt and
waist layers. Pants and shoes bundled into a complete outfit are not separate
swaps. The bonnet remains part of Vesper's model to cover the open scalp.

`dressingRoomImports.json` inventories the 36 separate female garments added in
9bd8f49. Vite exposes only IDs whose GLBs are materialized, excluding LFS
pointers. These pieces are explicitly marked Fitting pending until fitting,
coverage, and a runtime equip path are ready. LOD alternatives are one item,
and the five raw Gothic skirts are represented by their fitted wardrobe sets.
No raw asset is loaded just by browsing its category. The Ready to wear filter
hides fitting work. Search filters the current category.

Category/search/filter changes never alter saved character state. Equipping a
card feeds the existing coalesced autosave; keyboard/controller row navigation
and the pending-save-on-close behavior remain intact.

```sh
node --test tests/dressing-room.test.mjs tests/character-page.test.mjs tests/wardrobe.test.mjs
```

## Garage presentation fixes

The eye toggle is part of the bottom camera toolbar, including the character
camera controls, and remains available after hiding the interface. The circular
reflective platform and its turntable portal are restored from 8e0b729, retaining
the newer camera envelope and reflection budgets. Reduced Motion still pauses
automatic rotation.

Male cockpit entry passes through the vehicle's forward heading before turning
in through the door. It keeps the final seated pose and female entry unchanged.
The stripped rig fixtures in tests/fixtures preserve the shipped joint transforms
without including visual meshes; garage-entry.test.mjs checks both door sides
and compares the female poses with the accepted 9bd8f49 sequence.
