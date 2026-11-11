# Garage characters

Heroes and Garage use the portrait at the right of the header to open Character.
The editor previews changes on the same turntable as the vehicle. New profiles
confirm a character model before editing. During alpha, Appearance, Identity,
and Emotes can switch between male and female models. Each model keeps its own
saved outfit and appearance. Identity saves Male, Female, or Nonbinary
independently of the equipped model. The server saves edits automatically,
and the editor keeps pending changes through a reconnect to the same profile.

Vesper's desktop garage uses the full `villager-female.glb`. The compact
garage and portrait share the same geometry with smaller textures. The
selected car loads over a simple stage first. Once the car is on screen, the
garage shell and driver can load. A circular reflective turntable accentuates the vehicle. The platform follows the display rotation, and Reduced Motion stops automatic rotation. If the character file is missing or unreadable,
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
chooses a gesture from the equipped personality without immediately repeating it. The same clips are retargeted to Vesper's imported
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
choices contain `wardrobe: { set, shirt, waist }`. Older profiles with a saved
shirt layer keep their set and waist fit and now load with `shirt: "none"`.
Complete Gothic outfits hide the original black shorts and use the skirt with
a lower-body coverage mask. Identity, bag, face, hair, and color choices stay
on the same character.

Each set has a `garage.glb` and `mobile.glb` in
`public/models/characters/wardrobe/`. Both must be installed before the set can be equipped. Portraits and compact garage/victory views use the mobile model. A
missing or retired set falls back to the original clothed character model.
The Underbust Vest asset files and saved preset ID are retained for reuse.

Garment nodes carry `wardrobeRole` extras. Fitted variants provide tucked and
long hems. The runtime uses the first two `_AVEN_COVERAGE` bits in older GLBs
for the tucked and over-skirt fits. Hidden body triangles are removed from a
private index buffer when the selection changes. The source model stays shared
and disposal restores source geometry. New imported clothes still need fitting,
weights, and masks.

Asset checks (run from `frontend`):

```sh
node scripts/build-wardrobe-lods.mjs /path/to/raw /path/to/output
node scripts/check-wardrobe-assets.mjs /path/to/output
node scripts/sample-wardrobe-emotes.mjs /path/to/raw/gothic-01.glb /path/to/poses.json
node --test tests/wardrobe.test.mjs
```

Keep face/body coordinates unquantized: existing face shaders use bind-space
positions. The asset checker loads compressed GLBs through Three.js and tests
both waist fits, weights, role tags, and coverage flags. It compares corset
vertices, normals, UVs, and weights with the authored shell. For the revised
sets it also tests coverage in idle, clap, shoulder stretch, and wave poses.
It strips textures for Node loading, so live material rendering still needs
visual review.

## Dressing room

Character tabs are Identity, Appearance, and Emotes. Appearance keeps the live
character in the center, with a scrollable left wardrobe rail and one item per
catalog row. It reuses the existing scene and draws cards with lightweight SVG
illustrations. Face, hair, skin, and headwear categories focus the
face camera. Leaving restores the earlier camera. Colors contains preset dyes,
paired palettes, and custom fabric/accent pickers.

Outfits contains complete character looks and fitted Gothic corset-and-skirt
sets. An outfit's details open close-ups for its individual pieces, with waist
layering controls for the selected Gothic set. Shoes and socks, headwear,
accessories, handheld props, hair, face, and skin tone have their own categories.
The bonnet remains part of Vesper's model to cover the open scalp.

`dressingRoomImports.json` inventories the 36 separate female garments added in
9bd8f49. Standalone tops, skirts, coats, and dresses stay in the inventory for
future fitting. Materialized footwear, headwear, and accessories appear as
Fitting pending in their categories. Each entry groups its LODs, and browsing
loads only the card. Ready to wear filters out fitting work, and search filters
the current category.

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
# Character tools in Play and Explore

The saved driver appears in Play and Explore mode selection, all vehicle pickers,
and the queue preview. The profile portrait on Play/Explore opens the same
Character editor used by Explore's Sandbox HUD and the World/Vehicle builders.

The character workspace borrows the shared canvas and uses OrbitControls with
character-scale clipping and zoom limits. Drag to orbit, right-drag to pan, scroll
to zoom; touch uses one finger to orbit and two to pan/zoom. Presets frame the full
body, face, upper body, waist, feet, back and sides against the loaded actor bounds.
The bottom toolbar also has zoom, reframe, hold/resume pose, and the eye toggle.
Appearance categories still save through CharacterPage's acknowledged save queue;
failed saves keep the editor open. Editing uses the existing wardrobe choices,
not vertex sculpting or independent garment fitting.

World drafts and history stay in their stores; a suspended vehicle panel stays
mounted to retain unsaved tuning. Its controller listener is disabled while the
character editor owns input. Returning restores the original screen, overlay,
workspace and builder presentation. Frozen poses render on demand. No extra
canvas, world entity or server physics actor is created by this preview tool.


## Piece colors, inspection, and personality

The fitting-room label sits above the character name at the top left of the
stage. The selected piece appears at top right.
Both sidebars extend beside the center color and camera toolbars to the footer.
Choose an equipped piece in the center toolbar, or click its catalog card, to
inspect it. Selected item measures the visible garment or accessory, including
glasses and the bag. Camera presets ease between angles. Manual editor
orbit/pan cancels the transition.
Hold pose freezes animation. Clicking the character resumes a personality gesture.

Fabric and trim overrides are stored under `appearance.item_colors` by outfit
or wardrobe set plus piece, such as `gothic-01:skirt` or `aviator:glasses`.
Reset piece clears only that override; switching outfits retains each palette.
Shared GLB materials are cloned per garment and actor. Original fabric textures
remain in place; trim affects materials with a separate trim/hardware channel.
The former Dockwear label is Village dress & petticoat; its saved ID is unchanged.

Identity includes Friendly, Playful, Shy, Tsundere, Stoic, Elegant, Racer, and
Scientist personalities. A character click selects one of four matching emotes,
excluding the preceding click. It uses the normal lazy clip/prop loader and
crossfades from the current gesture. Reduced Motion and seated driving disable
click gestures. Character drag and pointer cancellation do not trigger an emote.

Inner rotation arrows turn the character; outer arrows turn the vehicle display.
Dragging directly on the character with a mouse turns the model independently.
In the Fitting Room and standalone editor, dragging the scene background orbits
the camera around its current framing target. The garage vehicle display keeps
its turntable drag. Touch supports one-finger orbit in both fitting views and
two-finger pan/zoom in the standalone editor.

The Camera tools icon opens view and garment close-up buttons, a zoom bar,
rotation, and Reframe. The Heroes Fitting Room uses the garage with an angled
mirror that reflects the live character. Ruffled Corset first equips in
Over skirt.

Emotes includes Auto, Full skirt, and Fitted clothing fits. Fitted uses closer
arm targets while allowing more wrist clearance when the model wears a skirt.
Raised gestures, explicit prop grips, and face contact IK retain their contact
goals. Pose fit still requires visual review during motion. No new GLBs are
required for these controls. Server validation persists the appearance fields.


## Fit review and mirror check

Fit revision 5 shortens and contours the underbust shoulder straps against the
bare-body mesh, replaces arm/twist weights on corsets with torso weights, and
shares waist weights across touching garments. Tucked hems sit inside the skirt.
Fit revision 6 reshapes the laced straps and vest shell, extends the high-collar
back, refits Vesper’s shoes, and adds clearance to the Ruffled Corset overskirt.
Fit revision 7 restores the earlier Thin Weld shells for the Laced Bodice and
Underbust Vest. The laced shell gets a small left rear strap backing, and the
vest uses a chest insert that follows the original skin weights. The High
Collar uses fitted fabric across the chest, back, and shoulders. The original
corset vertices, seams, and texture coordinates stay intact in both waist fits
and model tiers.

Emotes uses a left filter rail and a right searchable results list. All searches
the whole library, My personality shows the equipped personality's reactions,
and pack filters narrow the list. The center remains the existing live scene.

Fit checks are manual: front, back and animation must all be checked, with no
outstanding issue note, before a combination shows a checkmark. Records are
local to this browser, namespaced by profile, fit revision, garment, set, waist,
animation fit, glasses, prop and pose. A new asset revision starts untested.
Each waist fit and emote has its own check.
The original Wearing indicator is a dot, distinct from the fit checkmark.

Side mirror · lipstick check appears in Garage and All for supported road-car
previews. It selects the nearer separate exterior mirror where the GLB has one;
fused meshes use an estimated window corner from the authored driving station.
The character steps over, faces the mirror, checks their lips with a small prop,
and returns to the standing mark. Character rotation is held during this
vehicle interaction. It still needs visual in-game approval per vehicle/rig;
finite animation tracks and a returned rest pose alone do not certify placement.

```sh
node scripts/refine-wardrobe-fit.mjs /path/to/original-v4 /path/to/v5
node scripts/render-fitting-audit.mjs /path/to/v5 /path/to/audit-json
blender -b -t 4 --python scripts/render-fitting-audit.py -- /path/to/audit-json front
blender -b -t 4 --python scripts/render-fitting-audit.py -- /path/to/audit-json back
node --test tests/fit-review-mirror.test.mjs tests/fitting-controls.test.mjs
```
