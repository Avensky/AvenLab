# Vehicle previews, materials and Supra wheel assemblies

The selection preview intentionally loads a complete GLB without mounting the runtime vehicle TSX. That path previously skipped the material corrections in Camaro.tsx and Supra.tsx. Preview and runtime now share `vehicleMaterials.ts`: solid surfaces write depth and use opaque materials, while Camaro window parts and Supra window material slots remain see-through. Supra window surrounds and red lamp slots remain separate from the glass. Materials belong to each vehicle instance; geometry and texture resources stay shared with the GLTF cache.

The Supra currently in main contains 295 mesh objects: 25 body meshes and 270 wheel pieces. GLTFLoader sanitizes names such as `Calliper Front R` into `Calliper_Front_R`, retaining the original name in `userData.name`. The previous exact-name lookup did not recognize these loaded names. The asset also contains repeated corner names, empty corner groups and wheel fragments for other corners nested under Front R. Treating one matching group as a complete wheel would assign fragments to the wrong wheel or drop them.

`supraVisualRig.ts` starts from the complete scene, including collections beside VEHICLE_ROOT. It discovers wheel branches using both original and loaded names, records each fragment's full imported matrix, and assigns the fragments by their positions in the vehicle's +Z-forward frame. Negative model X maps to backend left. It creates one carrier and one rotating subgroup for each of FL, FR, RL and RR. Caliper materials stay on the non-spinning carrier; tire, rim and rotor pieces spin around their imported axle. Reparenting preserves the full fragment matrices, including mirrored scales.

The runtime body and carriers still follow the backend poses. The recovered wheels provide a valid static wheel-plane reference to the existing visual alignment hook, so its height correction can align the body with the backend's nominal wheel center. This does not change physical suspension, spawn height or collider geometry. Alignment still requires the backend collider metadata and Automatic GLB alignment enabled.

The source GLBs are not re-exported by this patch. The frontend uses the current Supra GLB as supplied. New clean wheel collections can remain siblings of VEHICLE_ROOT; they do not have to be merged into a single wheel mesh.

## Verification

Run the normal frontend lint, typecheck, test:performance and build commands. Fixture tests cover sibling collections, nested duplicate groups, preservation of every mesh and transform, material ownership, glass isolation, caliper behavior and backend wheel poses. An additional test loads the real current Supra GLB and confirms four wheel assemblies, preserved bounds and a valid alignment reference. That test substitutes image uploads only, since Node has no browser image decoder or GPU; mesh buffers and transforms are real. It skips with an explicit message in a checkout that has only an LFS pointer. Run `git lfs pull --include=frontend/public/models/vehicles/supra_2020.glb` to enable it.

In the browser, select Camaro and Supra and check body opacity and clear windows, then drive Supra in Sandbox. Inspect all four wheels while steering, rolling and braking. Test per-instance glass by viewing another Supra while switching the local camera. Browser visual and live driving checks remain necessary because automated tests do not render the materials through a GPU.

## Mazda CX-30 Rescue

The 2020 CX-30 started as 679 separate mesh objects in one Blender collection.
The prepared Blender file retains the full-detail parts. The driving GLB batches
them into 13 meshes, 54 material primitives and 275,896 triangles. It embeds
the factory paint, 25 materials and the complete cabin. The hero tile is a
render of the exported GLB.

The chassis origin is 0.845 m above the tire contact plane at rest. The game
uses +Y up and +Z forward. The exported Blender scene faces −Y before glTF
axis conversion. The model is 4.329 m long, 2.132 m across the mirrors and
1.540 m tall. The collider is 1.870 m wide at the bodywork, excluding the mirrors.
Wheelbase is 2.619 m, track is approximately 1.625 m and tire radius is 0.341 m.

| Model group | Purpose |
|---|---|
| VEHICLE_ROOT / CHASSIS | Chassis, contact-plane and cockpit camera references |
| BODYWORK, GLASS, INTERIOR, LAMPS, TRIM | Separate paint, glazing, cabin, lighting and trim materials |
| WHEEL_FL, WHEEL_FR, WHEEL_RL, WHEEL_RR | Hubs at the measured tire centers for backend suspension and steering |
| SPIN_* | Tires, rims and brake discs roll around each local X axle |
| CALIPER_* | Calipers steer and follow suspension with their carrier |
| HEADLIGHT_*, BRAKELIGHT_*, TURN_* | Light attachment points in chassis space |
| CAMERA_DRIVER | Default driver eye position, configurable in Vehicle Editor |

The sunroof pane uses its own tinted, alpha-blended material. The blind and
grip sit under the rear headliner in both the editable rig and the game model.
Roof guns, tank traverse, the scope and the barrier sample the same render
timeline as the chassis, including shortest-arc yaw across ±π.

The camera and suspension dimensions come from the supplied model. Mass,
handling, spray and shield values are gameplay tuning. The CX-30 has a 16 m,
45-degree pressure spray with ten pulses before a 2.5 s recharge. Its Dive
Shield lasts two seconds. The BRZ retains its personal frontal Guard Boost.

## Mini Cooper

The F56 Mini uses the same meter-scale socket rig as the CX-30. In Blender it
faces −Y. In the game it faces +Z with +Y up. The root and chassis anchor are
at the body origin. The contact anchor is 0.769 m below it. Body paint is the
material named `body`. Windows and the panoramic roof have separate materials.

The model measures 3.876 m long, 1.933 m wide across the mirrors and 1.701 m
high including the antenna. The four tire centers give a 2.488 m wheelbase,
1.478 m track and 0.308 m radius. The supplied axle-pair meshes are separated
by side. Each `WHEEL_*` owns a rotating `SPIN_*` and a fixed `CALIPER_*`.
The editable scene retains its body parts and packed textures. The game export
batches those parts into bodywork, glazing, cabin, lamp and trim meshes.

## Support SUVs and Sierra pickup

All three exports use the same wheel, chassis, camera and lamp socket convention
as the CX-30. The editable Toyota scenes keep the original mesh and parent names
in the mesh objects' `source_object` and `source_group` properties. The game
exports batch fixed geometry and simplify each material separately. The Land
Cruiser's spare tire travels with the chassis.

| Hero | Vehicle file | Role | Wheelbase | Tire radius | Export triangles |
| --- | --- | --- | --- | --- | --- |
| Mechanic | fortuner.glb | Support | 2.750 m | 0.372 m | 213,860 |
| Logistics | landcruiser.glb | Support | 2.853 m | 0.413 m | 203,004 |
| Sierra AT4X | sierra.glb | Tank | 3.709 m | 0.430 m | 209,740 |

The first Toyota's source mesh and material identifiers say Fortuner. The model
needed a 100× unit conversion. Its packed AO/normal inputs and emissive colors
were producing brightly colored trim. The corrected materials separate factory
body paint, cabin finishes, window glass, tires and metal. The full-detail
Blender sources keep their packed images for further editing.

Mechanic uses assisted health packs and recovery. The Land Cruiser fills the
Logistics slot with the shared roof gun. Its supply-transfer kit is pending.
The Sierra counts toward Tank capacity and has 900 hull HP with normal road
steering. Vanguard retains its tracked drivetrain, 1,200 HP and dedicated kit.
SUV and pickup mass, brake force and speed are initial game tuning.

### Sierra asset credit

“2024 GMC Sierra 1500 AT4X” by Ddiaz Design. The source lists CC BY-NC-SA 4.0.
The AvenLab derivative keeps that notice in its GLB asset metadata. Changes
include chassis and wheel pivots, camera and light sockets, mesh batching,
paint naming and geometry simplification.

[Original model](https://sketchfab.com/3d-models/2024-gmc-sierra-1500-at4x-41d0b29e3d2f4854a9b6349ccf918a1e) · [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/)
