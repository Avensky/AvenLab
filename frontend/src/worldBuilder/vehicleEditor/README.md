# Vehicle editor

World Editor owns authoring. Open **Edit Vehicle** from its header, change a
value, **Apply Physics**, then **Test Drive**. The compact test-drive bar returns
to vehicle tuning or world layout. Editing suppresses driving controls through
the existing overlay/brake policy; it does not create another input sender.

- `VehicleEditorPanel`: draft fields, bounded undo, factory reset, explicit apply,
  per-vehicle preset save/load and camera controls.
- `tuningFields`: supported scalar fields and units. Speed is shown in km/h and
  sent in m/s. Suspension stiffness is derived by the existing mass/sag solver.
- `vehicleEditorStore`: local camera profiles and one saved tuning preset per
  vehicle. Saving does not apply physics. Presets are browser-local.
- `VehicleCameraRig`: bird view, driver view and a replayable side approach into
  the driver position, all following the shared interpolated vehicle pose.
- `EditorDriveBar`: small entry point during the dedicated editor test session.

Rust authorizes tuning only for Mode::Editor and derives the target vehicle
from server membership. It validates the complete patch before changing the
body, reuses the model-swap rebuild for colliders/mass/wheels, stops the vehicle,
and publishes the resulting config. Factory values are the base for each apply.
COM height is measured above the road at nominal suspension sag; it is separate
from collision-box translation. This first version does not edit COM X/Z,
chassis dimensions, or axle locations.

Camera coordinates are chassis-local metres (+Y up, +Z forward), independent
of GLB source axes. The orange eye/direction marker appears in exterior/bird
previews. Driver position, orientation, FOV and approach duration are editable.
There is no character requirement; existing interior geometry determines what
is visible. The side approach is a preview path, not obstacle-aware navigation;
use an open test area. Reduced-motion preference skips the animation.

The world and vehicle authoring scenes are exclusive. The gameplay scene is
mounted for vehicle preview/test driving; layout authoring uses its own camera.
The server continues ticking the isolated world; this is not a global pause.

Placeholder fuel, repair, and combined service buildings are under Garages /
small. Stop in their open bay to receive 3 L/s fuel, 6%/s condition repair, or
both. These use existing authoritative fuel/condition telemetry. Destructibility,
limited supplies, regional economy, separate suspension wear, terrain, water,
and automated city generation are follow-up work, not implemented here.

## Editor access and direct building

The editor test-drive toolbar owns Vehicle Editor, World Editor (full workspace)
and Build in World (compact 3D palette). Pause no longer contains World Builder.
The compact palette uses the exact same placement, snapping, undo and document
as the full editor, with an unobstructed center for selecting/placing prefabs in
3D. Apply & Test Drive remains the explicit physics rebuild. Bridge span and a
raised canal channel are placeholder prefabs; the channel is a visual water
strip with concrete banks, not terrain excavation or simulated water.

The full editor and compact build HUD both expose HIDE PREFABS / SHOW PREFABS.
Visibility is a saved editor preference and does not modify the map, current
selection, active placement or undo history. Hiding it releases its grid column.

The layout header now keeps only Prefabs, Tools and Exit. Tools opens a scrollable sidebar with world selection, vehicle editing, apply/test, detail, workspace, inspector and file actions. Escape/controller Back closes the sidebar before exiting. Its controls consume the Settings palette; there is no editor-specific theme state or selector.

Authoring disables distance fog while mounted and restores the scene fog on exit. Camera far/max-distance bounds scale with the fitted layout. Materials is a per-car mapping checklist; unresolved BRZ seat materials are explicitly pending, not guessed. Reset and sustained fall recovery use the server-recorded authored spawn instead of righting the car above its current X/Z.

The scene toolbar has a dedicated Pan View mode. Perspective uses left-drag orbit by default; Pan View uses left/one-finger pan, and top view always pans on left drag. Right drag pans, wheel zooms, and two-finger touch pans/zooms. Plan view also supports the Pan tool. Selecting transform tools exits Pan; placement exits Pan. Bottom Grid/Angle/camera controls sit to the right of the left tool bank, whose height is bounded on short screens.

Weapons tab: choose assault/support/medic placeholder and adjust XYZ chassis mount offsets. Presets are local per vehicle; the equipped mount is sent with combat input and replicated as a bounded world-oriented turret pose. Combat Test remains opt-in from the driving HUD.

Tank uses factory GLB yaw/elevation pivots and hull/turret collision proxies; its barrel is a query sensor. Weapons contains explicit Test/Stop controls. Bearing/reload moved into the instruments; instructions are in Cockpit -> Missions. See docs/TANK-AND-COCKPIT.md.
