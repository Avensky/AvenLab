# Gameplay driver LOD

Occupied road and tracked vehicles use a third, deliberately small character
representation. The fitting room keeps its detailed wardrobe models, fitting,
emotes and controls. Gameplay occupants do not load character GLBs or textures,
fit clothing, build an animation rig, run IK, or reproduce lace/material pieces.

## Appearance and occupancy

`DriverAppearance` is defined in
[`driverAppearance.ts`](../../game/characters/driverAppearance.ts). It carries
body silhouette, skin/hair colors, short/long/no hair, optional headwear and its
color, and the broad top/bottom colors. The server reduces the selected profile
when spawning or equipping a player. Compact snapshot version 3 appends this
optional `driver` field; the existing version 1/2 decoders remain supported.

Missing/null `entity.driver` means unoccupied. The renderer never fills a vacant
vehicle with a fallback character. Versions 1/2 therefore display no occupants.
Retained practice vehicles keep their driver during a reconnect lease: the
character/vehicle is still represented in the world even while its socket is
offline. Resuming preserves that appearance; removing the entity removes it.
`GameplayDrivers` reads appearance from the current snapshot on each frame, so
the existing roster selector can continue suppressing React renders for pose
packets. Removing an occupant clears its instances immediately, including
between visibility polls. Palette/body changes do not rebuild the geometry.

Only the network vehicle roster mounts this component. Static parked map props,
hidden/collider-only views and the local selection preview do not gain a
gameplay occupant. Naval bridges are excluded: their authored units and ship
transforms need a separate calibration.

## Rendering budget and update path

The whole fleet shares eight possible instanced batches and one texture-free
Lambert material. A visible occupant uses three to five batches: skin, one body
shape, bottom, optional hair and optional headwear. Male, female and neutral
torsos have different shoulder/waist geometry. Instance colors preserve the
main outfit palette without a material or scene graph per character.

| Budget | Amount |
| --- | ---: |
| Maximum triangles per visible occupant | 592 |
| Shared geometry attribute/index data, all variants | 34,488 bytes |
| Maximum occupied-fleet draw calls | 8 |
| Shared materials | 1 |
| Character textures, skinned meshes, bones, mixers | 0 |
| Instance transform/color storage per roster capacity | 608 bytes |

These are source/CPU buffer budgets, not measured browser frame times or total
GPU memory. Actual rendered draw calls depend on which silhouette/hair variants
are visible. Sixty-four drivers still use at most eight draws; the mesh count
does not grow with the number of occupants.

One frame callback uses the same interpolated poses as the cars. Reusable
matrices/vectors and color objects avoid per-occupant frame allocations.
Transform/color buffers are uploaded only when their contents change. Colors
are parsed only when the corresponding appearance value changes.

Visibility is evaluated at 10 Hz using the projected upper-body height and a
frustum sphere. Normal mode enters at 8 CSS pixels; low-detail mode enters at 12.
The leave threshold is 72% of the enter threshold, reducing threshold flicker.
An omitted occupant performs no interpolation or transform work between polls.
Zoom affects projected size naturally, including orthographic/scoped views.
Newly visible occupants can take up to 100 ms to appear.

## Cabin placement and ownership

`driverCabin.ts` reuses the fitting-room `GARAGE_STATIONS` seat side, seat height,
roof clearance and tracked-vehicle units. Headwear lowers the seat fit enough
to remain below the roof. `roadLamps.modelOffset` supplies the same imported
visual frame used by local cars, or the measured tire-floor offset for remote
LOD cars. The tank adds its existing baked source-floor correction when no
detailed visual-alignment report exists.

The pose is a static seated silhouette. It does not solve wheel/hand contact,
pedals, cloth clearance or emote poses. Those details belong to the fitting-room
representation. Cabin geometry hides most of the lap and legs in normal views.

All geometry, instance buffers and the material are created in the committed
layout effect and disposed on roster replacement/unmount. An abandoned React
render creates no GPU resources. StrictMode effect replay disposes the previous
committed fleet before creating a fresh one. No module cache retains prior
rooms, profiles or driver scenes.

## Validation and remaining checks

Run `node --test tests/gameplay-drivers.test.mjs` from `frontend`. The regression
checks exercise real geometry/batch/frame code: the triangle and draw budgets,
three body silhouettes, every supported seat/roof calibration, pixel
hysteresis, live appearance/occupancy updates without roster changes,
interpolated transform placement, suppression of culled work, unchanged-buffer
reuse, and complete/idempotent disposal.

A real WebGL/browser capture is still required before calling this GPU-verified.
Check representative local and remote cars through their glass, right- and
left-hand seats, roof/headwear clearance, close-range silhouette readability,
camera zoom and the 8/12-pixel transitions. Measure renderer draw/triangle counts
and GPU/CPU frame time with the intended occupied-vehicle counts on desktop and
a lower-end device. The current workspace cannot launch the browser because
its Unix socket operation is denied; no FPS or VRAM improvement is claimed from
the Node regression tests.
