# Garage lighting, selection and dashboard startup

Use **Settings → Garage** for the selection garage's presentation. These controls
are saved on this device and apply to game-mode and hero previews. The gameplay
renderer, vehicle paint, controls and world-editor map data keep their own owners.

| Setting | Default | Effect |
| --- | --- | --- |
| Bloom glow | On | Soft halos around bright fixtures |
| Glow strength | 50% | Halo intensity |
| Glow spread | 25% | Halo width |
| Glow threshold | 1.00 | Lower values include more lit surfaces |
| Accent brightness | 100% | Theme fixture radiance and reflected brightness |
| Garage exposure | 80% | Overall selection-garage exposure |
| Vehicle & wall reflections | On | Static garage reflection environment |
| Floor reflections | On | Shared floor/platform mirror capture |
| Floor reflectivity | 100% | Mirror contribution to the floor finish |
| Platform reflection softness | 25% | Blur on the rotating platform |
| Restore garage effects | Reset | Resets only these garage controls |

Colors follow **Settings → Accessibility → Interface theme**. Hacker, Navy,
Deep Purple, Pastel Purple, Strawberry, White and Black retain their existing
palettes. High contrast uses reduced white emission and turns bloom off; saved
glow values remain available when high contrast is turned off.

## Green reflection correction

Drei's `Environment` with `frames={1}` captures its cube map in a child layout
effect. The previous parent passive effect tinted the visible garage afterward,
leaving the already-captured vehicle/wall reflections green. The new reflection
snapshot owns small material copies and receives the selected palette before it
is passed to Environment. Visible fixtures are also tinted in a layout effect.

The snapshot includes the room, completed structure and platform. It shares
geometry/textures with the prepared garage. Cleanup disposes only its owned
materials and instanced buffers. The original GLTF cache and live vehicle paint
are not modified. The two green PST switch faces are now tagged for base-color
retinting; they remain non-emissive.

## Glow and performance

Fixture radiance compensates for palette luminance, so blue/purple can reach the
same bloom threshold as green without turning their hue white. Neutral ceiling
fixtures keep their authored appearance. User brightness multiplies the saved
original intensity, so changing colors or contrast cannot compound dimming.

A memoized reflection element prevents hero hovering and glow-only edits from
starting another six-face environment capture. Theme, contrast, accent brightness
and re-enabling environment reflections create a new already-tinted snapshot.
The existing 128px cube target is reused across palette changes and stays static
between lighting edits. Initial development Strict Mode can replay setup; normal
lighting updates do not remount the probe.

Bloom Off, zero glow strength and high contrast disable the bloom pass itself,
skipping its blur passes. Floor reflections Off or zero floor reflectivity skip
the planar capture while keeping the black tiles and safety band. Zero softness
skips the platform's blur taps. All options reuse existing update/render owners;
there is no new socket, sampler, timer or animation loop. Exposure is restored
after each garage frame. Disposing the garage removes its postprocessing chain.

## Installation and validation

If the preceding selection-controls patch is already installed, rebuild/restart
**the frontend only**. The cumulative bundle also includes the preceding Rust
changes for users installing from an older version; those users must rebuild both.
No new dependencies, GLBs or textures are required.

See the bundle's `validation.json` for tests and browser checks. Software WebGL
and emulated viewport/controller checks do not establish phone GPU performance.

## Selection bars and transitions

Environment, CAN interface and capture-mode strips use the shared theme panel,
text, border and accent tokens. Sandbox/Editor retain a quiet single environment
control; Recon retains its distinct active-field highlight. Approved controller
and keyboard tab controls are unchanged.

An admitted `mode_join` acknowledgement now opens heroes directly instead of
briefly routing through the queue screen. A real queued admission keeps the
existing garage canvas, camera and materials mounted; hidden 3D rendering pauses
while the waiting video is shown. Returning to portraits resumes that canvas.
The small selection panels load with the core UI, avoiding an opaque lazy-panel
placeholder. First canvas reveal fades over a themed background after its first
render; reduced motion removes the fade. Selection routes clear stale loading
gates and the global world loader no longer covers mode/queue selection.

An explicit empty admission marks its selection initialized, so an older lobby
view cannot restore a previous hero before the new admission view arrives. This
preserves the unpicked initial state and preview-before-confirm behavior.

## Dashboard startup

The ignition and instruments share one confirmed engine-state selector. A live
ENGINE_ON confirmation wins over a trailing STARTING flag. Cranking uses one
230 ms CSS pulse pattern and clock phase for the key ring and the complete gauge
cluster; it does not add a frame timer. Running removes the pulse and uses the
saved brightness gain. OFF/ACC remains dimmed; explicit key ON and START power
the instruments at the saved level. Stale/offline telemetry stays unavailable.
Reduced motion disables the pulse. HUD visibility remains the user's choice.
