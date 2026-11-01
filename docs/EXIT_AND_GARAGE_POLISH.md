# Exit confirmation and AE86 garage paint

## Leave game

The two actions use the shared Xbox glyphs and borderless action style:

| Input | Action |
| --- | --- |
| Xbox A, Enter, numpad Enter or Space | Confirm leaving |
| Xbox B or Escape | Cancel and return to pause |
| Pointer/touch | Activate the button that was clicked |

The dialog has no movable selection. Focus starts on the dialog itself;
directional inputs do not select actions, and Tab cannot leave the modal.
Keyboard/controller confirmation stays the same even if the pointer focused
Cancel. Repeated keyboard activation is ignored, and the existing controller
neutral-release gate prevents the A press that opened Leave from confirming it.
The existing pending-request guard blocks duplicate actions while the server
releases the seat. Confirm preserves the existing release/disconnect/reconnect
order. Cancel keeps the connection and seat.

Microsoft's Xbox navigation guidance uses A to select and B to go back, with
consistent, visible button prompts. This two-shortcut dialog makes the positive
and negative actions explicit:
https://learn.microsoft.com/en-us/gaming/accessibility/xbox-accessibility-guidelines/112

## AE86 garage glare

The current AE86 asset exports its Primary.002 body paint as pure linear white
(1, 1, 1), with metallic factor 0.559 and roughness 0.355. Strong HDR garage
lighting pushes that large white hood/roof into the bloom pass at some angles.

The prepared garage clone calibrates only that white primary paint to linear
0.72 and a minimum roughness of 0.42. Metallic reflections remain enabled at
their authored value. This is a small material adjustment before the first
render; it introduces no shader fork, draw call, texture, timer or frame callback.
It is idempotent and preserves shared geometry/textures. Glass, trim, other cars
and future colored/custom primary paint keep their existing settings.

This applies only in the selection garage. The cached GLB and driving rig remain
unchanged. Bloom/glow and the shared garage lights retain the user's settings.
Very strong custom glow can still soften highlights; Settings → Garage owns
those effects.

## Install

The patch is based on Git 1498aa8 and includes earlier cumulative updates.
Rebuild the frontend after applying. Rust is unchanged from the preceding garage
patch/current Git; only installations from older patch levels require its earlier
Rust changes to be rebuilt. See the bundle README and validation.json.
