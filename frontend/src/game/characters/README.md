# Garage characters

Heroes and Garage use the portrait at the right of the header to open Character.
The editor previews changes on the same turntable as the vehicle. New profiles
confirm a character model before editing. Identity, Appearance, and Emotes share
the Character header tab list, which opens on Appearance on the first visit.
Use the shoulder buttons or Q and E to switch tabs. Choose the model in Identity
to preview its saved outfit and appearance in the other tabs. Identity saves
Male, Female, or Nonbinary independently of the equipped model. The server saves
edits automatically, and the editor keeps pending changes through a reconnect to
the same profile.

Heroes, the fitting room, and the portrait worker use a losslessly packed
copy of Vesper's bundled `villager-female.portrait.glb`. The character LOD
build generates it from the installed asset and includes the source hash in
its URL. It compresses vertex and index buffers, keeping triangle order,
skinning inputs, and all 19 embedded WebP images. The packed model is 3.88 MB
and the source is 5.50 MB. Actual transfer size depends on HTTP compression.
The authored portrait is the fallback if the packed model is unavailable.

Garment detail is selected independently of the base character. The selected
car loads over a simple stage first. Once the car
is on screen, the garage shell and driver can load. A circular reflective
turntable accentuates the vehicle. The platform follows the display rotation,
and Reduced Motion stops automatic rotation. If the character file is missing or unreadable,
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
## Garage door and mirror previews

Garage entry selects the front door on the current driver seat's side.
An exterior handle mesh or marker anchors the grip. A movable door panel
without a named handle supplies an approximate grip from its bounds.
The hand reaches before the panel starts to swing, follows the grip in
hinge space, then releases before stepping in. Fused body meshes require
a separable door assembly to show this contact.

The Garage emote list has side-mirror versions of Check makeup, Redo
lipstick, and Apply eyeliner. All three use the exterior mirror on the staged
door side. Separately named mirror meshes give the target point. Fused mirrors
use an estimate near the window corner.

In Appearance, Camera tools has stationary versions of all three actions
with a face close-up. Look away is also available for outfit inspection.
The lipstick and eyeliner emotes follow rig-specific face landmarks and
use temporary handheld props. These previews leave saved appearance colors
as equipped.

## BRZ driving set

In the BRZ cockpit, select **Race start · Stare-down, throttle and brake**
from Driver gestures. The driver looks toward the neighboring lane, returns
her gaze to the road, presses the clutch, selects first gear, and feeds in
throttle as the clutch comes up. The shot cuts from her face to the shifter
and pedals, then back for the braking dip and recovery. The preview shifter
follows a left-then-forward gate and supplies the target for her hand. The set plays in the cockpit preview.

The steering grip follows the measured BRZ rim. The source GLB has an empty
pedal node, so the cockpit creates three lightweight movable pedal plates
and removes them on exit. The right foot follows the accelerator and brake
surfaces, and the left foot follows the clutch in Clutch and shift. Floor
hinge, pedal throw, and contact offsets come from `garagePedalRig.ts`.
A second vehicle can opt in by supplying a `drivingSet` pedal layout on its
wheel station and fitting it to that vehicle's seat and footwell. Check the
steering wheel, seated headroom, and close camera framing on each model.

## Pose pack

In Character → Emotes → Preview emotes → Pose pack, pick a start pose, a
standing animation, and an end pose. Preview either pose on its own or play
the sequence. The player holds the end pose until you return to idle, play
another preview, or leave the pack. If the start pose is already held, the
sequence continues from it directly. The animation menu includes emotes that
need no scene prop. The shop bag is stowed during pose pack playback.

The pose selectors include all 117 BVH entries from the six
[MakeHuman Community CC0 pose packs](https://static.makehumancommunity.org/assets/assetpacks/).
The generated catalog retains each asset's pack, name, and author. The nine
multi-frame files repeat the same pose, so the converter samples the first
frame of each file and normalizes exports that repeat hierarchy offsets in
position channels. It maps torso, head, arms, palms, ankles, knee directions,
and foot orientation to AvenLab's shared controls. Lowered, outward-facing
free arms use the current garment's skirt clearance, even on imported poses
with palm orientation. Raised and cross-body gestures keep their authored arm
targets. Finger articulation,
seating surfaces, sports equipment, and garment-fit adjustments need a
visual pass on the target character.

To rebuild the catalog, extract each archive to its own directory under
`EXTRACTED_PACKS_DIR`, using the upstream pack names
(`makehuman_system_poses` and `poses01` through `poses05`). From `frontend`,
run `node scripts/import-makehuman-poses.mjs EXTRACTED_PACKS_DIR`.

Define new poses in `posePack.ts` with the same model-space targets as
garage emotes. Arm directions use positive Z for forward. Feet use offsets
from the resting ankles in stage meters. `holdCharacterPose` makes a static
clip and `composePoseSequence` accepts two poses and an authored emote. Pass
the result to `buildEmoteClips` to solve it for the target character's rig and
clothing clearance. Rebuild for each prepared character root because Three.js
tracks bind to that root's joint UUIDs. New rig families need to implement
the existing garage rig conventions before they can use the same pose data.

## Emote collections

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
breathing idle. `CharacterEmoteList` owns filtering and review badges. Keep
camera and zoom state outside the list so changing framing skips row updates.

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

Character → Identity opens a face close-up when changing hairstyle, hair color,
skin tone, iris color, or eyebrow tint. Glasses are under Appearance → Accessories.
The iris palette includes Obsidian black and five other deep shades, with
reduced iris and cornea reflections for the darkest colors.
Both villagers use these settings in the live model and their rendered portrait.

Rook's coat outfits can preview Folded arms by the door under Garage emotes.
The pose requires a fitted road-car side panel, closed doors, and empty hands.
Heroes cycles shorter gestures with a breathing idle between them. The preview
reuses compiled idle and gesture tracks when switching between Heroes and
Character on the same rig with the same bag setting. Each mode still resets
its playback state and releases temporary props on exit.

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

The [shared wardrobe catalog](../../../../packages/wardrobe-catalog/README.md)
defines the character choices and palettes. The garage renderer consumes
those choices, while the profile endpoint validates and persists them.

## Fitted wardrobe sets

The dressing room supports five Gothic corset designs on the existing Village
Woman rig. The Underbust Vest remains available as a try-on after retirement of
its complete outfit. `character-wardrobe.json` is shared with server validation. Saved
choices contain `wardrobe: { set, shirt, waist }`. Older profiles with a saved
shirt layer keep their set and waist fit and now load with `shirt: "none"`.
Complete Gothic outfits hide the original black shorts and use the skirt with
a lower-body coverage mask. Identity, bag, face, hair, and color choices stay
on the same character.

Each complete set has `.garage.glb` and `.mobile.glb` bundles under
`frontend/public/models/characters/wardrobe/`. Either installed tier makes the
complete outfit available. Full-size garage previews prefer Garage and compact
previews and portraits prefer Mobile. A missing or retired saved set
falls back to the clothed base character. The Underbust Vest has a separate
Over fit with room for a fitted top, an Original Cut option, and a Tucked fit.

Garment nodes carry `wardrobeRole` extras. Fitted variants provide tucked and
long hems. The runtime uses the first two `_AVEN_COVERAGE` bits in older GLBs
for the tucked and over-skirt fits. Hidden body triangles are removed from a
private index buffer when the selection changes. The source model stays shared
and disposal restores source geometry. New imported clothes still need fitting,
weights, and masks.

## Dressing room

Character tabs are Identity, Appearance, and Emotes. Appearance keeps the live
character in the center, with a scrollable left wardrobe rail and one item per
catalog row. It reuses the existing scene and draws cards with lightweight SVG
illustrations. Headwear focuses the face camera, and leaving restores the
earlier camera. Opening the color swatch mounts the preset dyes, paired
palettes, and custom color pickers. The closed picker keeps its panel ID for
`aria-controls` and shows the selected piece's current colors.

Outfits contains the complete village looks and three fitted Gothic sets.
Sweetheart and High Collar equip in Tucked, and Ruffled equips in Over skirt.
An outfit's details open close-ups for its individual pieces, with waist
layering controls for the selected Gothic set.

Corsets includes all five Gothic designs as individual try-ons. Choose any
skirt independently and use the corset's waist controls to compare fits.
Underbust Vest starts in Over skirt. Shirts and corsets share one top slot.
Selecting either replaces the other and keeps the skirt. Older saved looks
with both pieces show the selected shirt. Try-ons carry into Emotes for the
session.

Ruffled has independent fabric, ruffles, and ribbon dyes. The authored High
Collar has main fabric, inset, laces, trim, and metal dyes. Define corset
groups in [`corsetDye.ts`](corsetDye.ts) so the palette and renderer agree on
material names, saved keys, and fallback colors. Update the interface color
scheme through the [shared UI theme](../../theme/README.md).

Roomy and Wide Over skirt add 12 and 24 mm of clearance at the corset hem for
fuller skirts. Tucked and standard Over use their authored fits. Save a named
look in Wardrobe > Saved outfits to store its pieces, waist fit, hair, and
colors on the player profile. Opening a saved look starts a fitting preview.
The × cards toggle individual layers and retain the selected piece so it can
be restored. Saved looks also keep those layer settings.
Headwear has separate controls for the Village bonnet and its chin bow.

The dev and production builds extract separate Garage and Mobile corset GLBs
from the installed Gothic bundles. The extracted files contain the two fits
and their rig. Corset 04's strap and shell fit is baked into its generated
tiers. Authored Laced Bodice, High Collar, and Underbust variants have their own
standalone GLBs. The loader can fall back to a compatible alternate tier,
legacy standalone file, or installed bundle, depending on the set.
`wardrobePreviewAssets.ts` resolves the fallback order, donor choice, and next
visible outfit from the current sources. It checks that loaded clothing can
bind to the live rig before replacing the last complete outfit. An incompatible
local revision falls back to its original garment. An incompatible detached
corset advances to the next available tier or bundle. `GarageDriver` mounts
loaders for pending URLs and passes resolved assets to the renderer. The
resolver and fitter share the donor checks in `wardrobeBody.ts`. A full-skin
donor needs indexed geometry, skin
attributes, and the same ordered joints as the live character. A compatible
bundle can supply the donor. Otherwise the resolver tries the dedicated donor
and then the legacy Sweetheart bundle to restore the skin the stock outfit
cuts away. Dress portraits use the same donor order and rig checks. The
portrait worker uses a compatible full body already present on the actor,
and renders the stock outfit if the dress or a compatible body is unavailable.
From the repository root, run
`node frontend/scripts/build-wardrobe-pieces.mjs` to regenerate the extracted
pieces and donor.

The [shared garment catalog](../../../../packages/wardrobe-catalog/character-garments.json)
inventories the separate female garments under
`frontend/public/models/characters/female/wardrobe/`. The catalog keeps IDs
for archived imports such as Coat 01 and Dress 01.
Layers groups the pieces by where they sit in an outfit, from underwear to
overwear. Each entry groups its available model detail levels. Browse the
catalog to see the pieces, then try them on Vesper and check combinations with
the Emotes tab. Trial combinations are session-only and leave the saved outfit
in place. Ready to wear filters out fitting trials, and search filters the
current category.

Gothic skirt models live in
`frontend/public/models/characters/female/wardrobe/skirts/gothic-skirt/`.
Put optional `gothic-skirt-02-update.glb` and `gothic-skirt-03-update.glb`
exports beside the originals. Keep the matching `CLOTH_GOTHIC_SKIRT_02` or
`CLOTH_GOTHIC_SKIRT_03` mesh name and ordered Vesper skin joints. Restart
Vite after adding them. Compatible revisions keep their authored shape.
Missing or mismatched revisions use the original skirt and its automatic
waistband fit.

Equipping a complete outfit uses the existing autosave. Keyboard and controller
navigation work in the catalog and outfit details.

## Garment authoring and validation

Keep the source garment, textures, and unmodified Vesper body available when
editing a fit. A thin welded export worked for the Underbust Vest. Use the
source that preserves the garment's seam and material boundaries, then check
the export against the 88-joint Vesper rig. Preserve joint order, bind
transforms, inverse bind matrices, and normalized skin weights. Keep face and
body positions unquantized because the face shaders use bind-space positions.

- **Fit the cloth before changing skin coverage.** Bring the shell toward the
  body and check cups, armholes, necklines, and rear panels from several
  angles. Adjust crowded cup panels locally to preserve the silhouette and
  seam placement. Use the full-body donor and a per-fit index mask for covered
  skin. Keep visible triangles along strap roots, underarms, keyholes, and
  laced openings. Whole triangles can cross a garment edge and expose a hole
  if they are cut by a single sample. Each preview owns its index buffer. A
  fitted Village actor with fixed source coverage retains a mask for each
  visited waist and bra combination, so switching back reuses the visible
  triangle list. On an outfit with selectable bras, the first fit records
  which triangles the other clothes cover at that waist. Changing the bra
  checks only skin that could be covered by the new style. The shared Laced
  Bodice cache holds up to eight masks per fitted source combination.
  When an outfit exposes part of the original cut body, the fitter remembers
  which donor triangles match that surface. Other outfits can reuse those
  answers until either surface's positions, indices, or draw range changes.
  For a new mask, coverage queries stop at the first cloth hit inside the
  sample range. They still check the center and corners near garment edges.
  Authored Laced Bodice and Sweetheart reuse Village waistband samples for the
  same corset, body donor, and skirt surface. Belt selections can reuse those
  samples, while skin-mask reuse follows the visible layers.
- **Reuse underwear cuts from the same donor.** Classic, Push-up, and briefs
  each trace fabric and bindings from the intact body. Cache the CPU geometry
  per donor and style and rebuild it when a contributing attribute or index
  changes. Each actor owns its render geometry and dye materials.
- **Fit front and rear straps through motion.** Start the front straps close
  to the chest and seat the rear straps near the shoulders. Favor torso and
  shoulder influence at the roots and reduce upper-arm and twist influence
  along the narrow edges. Compare both sides at rest and through arm reaches.
  Check the top and rear crest as well as the visible front seam. Keep an
  authored keyhole open, including the skin visible through it.
- **Check a shirt with the hair and headwear equipped.** For Top 03, isolate
  arm motion from torso motion before altering the lower armhole. Then check
  which body triangles are visible through it as the shoulder rises. Preserve
  the collar folds by adjusting the braid at the nape and fitting the loose
  bonnet ribbons below their attachment. Recheck the ribbons against all five
  Pack 7 tops. Top 03 reuses fitted positions and skin weights on repeat equips
  while each actor owns the geometry it renders.
- **Check the waist with the skirt actually worn.** Compare Over and Tucked
  with the stock Village skirt and belt, the same pieces explicitly
  equipped, and the target Gothic skirt. The rear belt and skirt rim are
  separate surfaces. A fit can clear one and intersect the other during a
  weight shift. Check the rear in idle and intermediate frames as well as
  the front. Inspect visible skin and cloth at the waist after changing dyes.
- **Preserve details through re-export.** Keep authored UVs, base texture
  detail, normal maps, and material slots for fabric, trim, laces, eyelets, and fasteners.
  Sweetheart has independent front and hip laces. Laced Bodice has a separate
  finish control. Its original Thin Weld normal supplies the fold and weave
  detail on UV0. The fitted shell uses UV1 for the seam decal. Keep those
  channels separate when changing the fabric. The source material gives the
  undyed shell and eyelet panels their neutral tint and subdued sheen. Apply
  the tint only to undyed cloth so saved colors still match their swatches.
  Check a light and a dark dye, metal highlights, and close-up
  seam quality. Roughness and metalness affect how two materials with the same
  dye read under garage lighting. Decimation belongs on broad fabric regions
  where it preserves the fit boundary. Batch meshes with matching materials and skin behavior to
  reduce draws, while keeping separately dyed pieces independently selectable.
  Compare GLB bytes and triangle counts for each tier, and compare visible draw
  calls in the same pose.
  Compression can rotate a triangle's starting index while preserving its
  vertices and winding.

### Run the checks

From the repository root, with the frontend dependencies installed, run the
fast catalog and selection checks. They also work on a checkout with Git LFS
pointers.

```sh
npm --prefix frontend run audit:wardrobe
```

For the real-asset audit, install Git LFS and pull the tracked files named by
the audit. This Git Bash command limits the pull to the audit inputs.

```bash
audit_assets=$(npm --prefix frontend run --silent audit:wardrobe -- --list-lfs) &&
test -n "$audit_assets" &&
git lfs pull --include="$audit_assets" --exclude="" &&
npm --prefix frontend run audit:wardrobe -- --full
```

The full audit runs the fixture checks, builds standalone pieces, and checks
both the tracked and generated Garage and Mobile files. Each asset row reports
file size, stored triangles, and mesh primitives across the file's fit variants.
The validator checks vertex indices, authored normals, and the UV set each
material texture samples, including texture-coordinate overrides. The geometry probes
include idle, shoulder stretch, arm reaches, and waist weight shifts for the
garments that need them. Missing required LFS objects fail the full audit.
Review the finished materials and transitions in the game as well. The Node
geometry checks use the Three.js loader with textures stripped, and the audit
decodes texture files independently of browser rendering.

While the game-only server is being split out, pull-request checks are manual.
In GitHub Actions, select **Wardrobe audit → Run workflow** and choose
`fixtures` for the quick checks or `full` for fixtures, real Git LFS assets,
and Rust character-profile tests. **Latency Lab checks** is also available
from **Run workflow** for frontend and Rust verification.

The bundle-specific commands remain available from `frontend` for imported
source packages and animation sampling.

```sh
node scripts/build-wardrobe-lods.mjs /path/to/raw /path/to/output
node scripts/check-wardrobe-assets.mjs /path/to/output
node scripts/sample-wardrobe-emotes.mjs /path/to/raw/gothic-01.glb /path/to/poses.json
```

### Current fit review

The project owner approved Vesper’s Pack 7 Tops 01–05 and all five corset fits
for the alpha on November 17, 2026. The approved corsets are the Laced Bodice,
Sweetheart Corset, Ruffled Corset, Gothic Underbust Vest, and High Collar Corset.

| Garment | Confirmed | Regression checks |
| --- | --- | --- |
| Pack 7 Top 03 | The lower armhole follows the torso, while the upper rim follows the shoulder. The body mask retains the skin visible through the moving opening. The long Village braid bends over the rear collar and the Village bonnet ties hang higher. | Raise both arms in Overhead heart, turn to the rear quarter, then check the braid and ties with the arms lowered. |
| Laced Bodice | The tucked fit draws the hem inside the side turns of the Village belt. The skin mask retains the body behind the rear lacing and moving neckline. | Review the rear belt tip at an oblique angle and compare the cloth folds in a light and a dark dye. |
| Ruffled | The waist and cup clearance checks passed on both tiers. With the Village skirt and belt, both Over and Tucked passed the torso mask probe in all three poses. | Check the upper back and neckline in game during Overhead heart. |
| Underbust and bras | Both vest fits preserve skin at the outer cup as the arms rise. Each bra mask retains the skin under its moving neckline binding. | Review the vest with the bra removed and the Classic neckline during Overhead heart. |
| Sweetheart | The authored refit preserves chest and underarm skin. The animated skin mask passed both fits, both tiers, and both skirt routes in three sampled poses. | Review the revised cup and underarm silhouette and the Tucked waistband in motion. The old coverage samples predate the revised opening and authored skirt rim. |
| High Collar | Both tiers passed the torso mask probe with the Village skirt and the matched Gothic outfit after the Corset 05 update. | Review the raised-arm straps, armholes, and keyhole on the live model. |

The torso mask probe covers 44 outfit and tier combinations and 148 pose
samples. It checks idle, Happy applause, and Overhead heart on both tiers.
For Laced Bodice it also checks Comfortable weight shift and Shoulder stretch,
following the opening below the rear eyelets down to the waist.
Each finding includes the tier, waist, outfit, and
pose so it can be reproduced in the fitting room. Inspect the cloth against
the skirt and the separate belt as well. A torso mask can pass while a hem
still shows through the waistband.

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

## Character previews in Play and Explore

The saved driver appears in Play and Explore mode selection, all vehicle pickers,
and the queue preview. Use the Heroes tab to edit the character and wardrobe.


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
The initial press hit-tests the visible model. Once the drag starts, pointer
movement turns the character without testing each skinned garment again.
In the Fitting Room, dragging the scene background orbits the camera around its
current framing target. Touch supports one-finger orbit. The garage vehicle
display keeps its turntable drag.

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

Fit revision 13 follows the Corset 05 Thin Weld shoulder pattern. The upper
back panels extend farther around both shoulders, and the shoulder lacing
sits over a fabric inset that follows the rig.

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


## Automatically discovered wardrobe garments

Copy a skinned, garment-only GLB into a matching folder under
`frontend/public/models/characters/female/wardrobe/`. The catalog discovers
loose models in `tops`, `skirts`, `skirts/gothic-skirt`, `dress`, `Sleepwear`,
`kaftan`, `coat`, `armor`, `hats`, `hoods`, `socks`, `bowties`, `harness`, and
`bracers`. A lowercase hyphenated filename such as `lace-top.glb` supplies the
label and stable item ID. With `lace-top.garage.glb` and `lace-top.mobile.glb`,
the Dressing Room lists one item and uses its fitted detail tier as available.
Garment meshes need the matching family name or `clothingPiece` metadata, and
the ordered 88-joint Vesper skin. Keep Blender sources and preview exports in
separate directories.

Vite refreshes the index when local wardrobe GLBs change. Rebuild and restart
the Rust server before saving outfits that use new models. Both builds use the
same scanner, so install the same materialized GLBs on the build machine.
Curated items keep their existing IDs and metadata. Existing outfits keep
working when the underlying model remains in its original family and filename.

## Review the Underbust Vest cup and strap update

From `frontend`, run `npx vite` to start the standalone viewer without the
game's asset preparation. Open
`http://localhost:5174/previews/wardrobe-asset.html`. The same path works on
the production frontend build. Extract the review archive and choose or drop
`underbust-vest-review.glb` into the viewer. For a local checkout you can also
copy the GLB into `frontend/public/wardrobe-review/` and click **Open local
vest review**. Select **Right ¾** to see the wearer's right cup. Drag to orbit
and scroll to zoom in on the seam and the shoulder openings.

The archive includes the editable Blender file and matched before-and-after
views. The Fitting Room loads the integrated Gothic Underbust Vest from
`public/models/characters/female/wardrobe/corsets/gothic-underbust-vest.garage.glb`
or its `.mobile.glb` tier when the existing `gothic-04` item uses Over skirt.
Tucked into skirt uses the separate `gothic-underbust-vest-tucked` asset for
each tier. Both waist fits can fall back to their legacy geometry when the
rebuilt file is missing or fails to load.

Over skirt also exposes **Vest cut → Original Cut** when the lower-opening
assets are installed. Named outfits store the cut, bra style, and individual
dyes. In **Underwear → Bra**, choose Classic or Push-up. The Push-up style has
a lower neckline and smaller cups. Both styles can be worn on their own or
with the Gothic Underbust Vest. Choosing another top or corset clears the bra
selection. The rebuilt vest has independent Main, Binding, Front panel, Lining
and Hardware colors.

## Pack 7 tops — visual review

**Top 04 and shared underarm shading.** In a close rear
three-quarter view at the midpoint of Overhead heart, a short, angular shadow
remains where Vesper's upper arm meets the ribs. The bare reference body shows
the same crease. Keep the current shirt fit. Revisit the shared skin if the line
becomes visible during ordinary movement or at the usual fitting-room distance.

**Top 05 — visual review passed.** Check the white back panel between the
braid and waistband in idle, then raise both arms with Overhead heart. The
previous horizontal opening was absent in both review renders. A faint fabric
fold remains. The garage and portrait skin-mask checks found no missing
exposed skin in five sampled poses per tier.
